import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../data-access/prisma/prisma.service';
import {
  PgmqRepository,
  OrdersRepository,
  EventInboxRepository,
  ShipmentsRepository,
} from '../../../data-access/repositories';
import {
  ShipmentsService,
  ShipmentUpdateEvent,
} from '../../shipments/services/shipments.service';
import { Prisma } from '@prisma/client';

export interface IngestEventPayload {
  orderId: string;
  dedupeKey: string;
  eventType: string;
  eventTs: string | number;
  customerId?: string;
  address?: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
  };
  shippingFeeCents?: number;
  trackingNumber?: string;
  status?: string;
}

@Injectable()
export class IngestConsumer implements OnModuleInit {
  private readonly logger = new Logger(IngestConsumer.name);
  private readonly QUEUE_NAME = 'ingest_events';

  constructor(
    private readonly prisma: PrismaService,
    private readonly pgmqRepo: PgmqRepository,
    private readonly ordersRepo: OrdersRepository,
    private readonly eventInboxRepo: EventInboxRepository,
    private readonly shipmentsRepo: ShipmentsRepository,
    private readonly shipmentsService: ShipmentsService,
  ) {}

  onModuleInit() {
    this.startPolling();
  }

  private startPolling() {
    this.pollLoop().catch((err) => {
      this.logger.error('Polling failed unexpectedly, restarting...', err);
      setTimeout(() => this.startPolling(), 1000);
    });
  }

  private async pollLoop() {
    while (true) {
      try {
        const messages = await this.pgmqRepo.readWithPoll<IngestEventPayload>(
          this.QUEUE_NAME,
          30,
          2,
          5,
          200,
        );

        if (messages.length === 0) {
          continue;
        }

        await Promise.allSettled(
          messages.map((msg) => this.processMessage(msg)),
        );
      } catch (error) {
        this.logger.error('Error during poll loop', error);
        // Sleep a bit on global error preventing tight loop on failure
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processMessage(msg: {
    msg_id: number;
    message: IngestEventPayload;
  }) {
    const { msg_id, message: payload } = msg;

    try {
      // Validation: Check for required fields before starting transaction
      if (!payload || typeof payload !== 'object') {
        this.logger.warn(
          `Discarding message ${msg_id}: Invalid payload format`,
          payload,
        );
        await this.pgmqRepo.delete(this.QUEUE_NAME, msg_id);
        return;
      }

      if (!payload.orderId) {
        this.logger.warn(
          `Discarding message ${msg_id}: Missing orderId`,
          payload,
        );
        await this.pgmqRepo.delete(this.QUEUE_NAME, msg_id);
        return;
      }

      if (!payload.dedupeKey) {
        this.logger.warn(
          `Discarding message ${msg_id}: Missing dedupeKey`,
          payload,
        );
        await this.pgmqRepo.delete(this.QUEUE_NAME, msg_id);
        return;
      }

      let broadcastEvent: ShipmentUpdateEvent | null = null;

      await this.prisma.$transaction(
        async (tx) => {
          // 1. Acquire advisory lock
          await this.pgmqRepo.advisoryLockForOrder(payload.orderId, tx);

          // 2. Load EventInbox
          const inbox = await this.eventInboxRepo.findByDedupeKey(
            payload.dedupeKey,
            tx,
          );
          if (!inbox) {
            this.logger.warn(
              `EventInbox entry not found for dedupeKey: ${payload.dedupeKey}`,
            );
          }

          // 3. Load Order
          const orderId = payload.orderId;
          let order = await this.ordersRepo.findByOrderId(orderId, tx);

          // Create partial if missing and not CREATED
          const eventType = payload.eventType;
          if (!order && eventType !== 'SHOPIFY_CREATED') {
            // Partial creation
            order = await this.ordersRepo.create(
              {
                orderId,
                status: 'PENDING_PARTIAL',
                customerId: payload.customerId || 'unknown', // Essential field
                totalAmount: 0,
                shippingFeeCents: 0,
                lastEventTs: new Date(0), // Old time
              },
              tx,
            );
          }

          const eventTs = new Date(payload.eventTs);

          // 4. Out-of-order check
          if (order) {
            if (order.lastEventTs && eventTs < order.lastEventTs) {
              if (inbox) {
                await this.eventInboxRepo.updateStatus(
                  inbox.id,
                  'IGNORED_STALE',
                  new Date(),
                  tx,
                );
              }
              // Message will be deleted at the end of tx
              return;
            } else {
              // 5. Apply rules
              const updates: Prisma.OrderUpdateInput = {
                lastEventTs: eventTs,
              };

              if (
                eventType === 'SHOPIFY_CREATED' ||
                eventType === 'SHOPIFY_UPDATED'
              ) {
                updates.addressLine1 = payload.address?.address1;
                updates.addressLine2 = payload.address?.address2;
                updates.city = payload.address?.city;
                updates.state = payload.address?.province;
                updates.postalCode = payload.address?.zip;
                updates.country = payload.address?.country;
              }

              if (payload.shippingFeeCents !== undefined) {
                updates.shippingFeeCents = payload.shippingFeeCents;
              }

              if (Object.keys(updates).length > 0) {
                const updatedOrder = await this.ordersRepo.update(
                  orderId,
                  updates,
                  tx,
                );
                await this.pgmqRepo.send(
                  'shopify_outbound',
                  {
                    orderId,
                    changedFields: updates,
                    snapshot: updatedOrder,
                  },
                  0,
                  tx,
                );

                broadcastEvent = {
                  orderId,
                  serverTs: new Date().toISOString(),
                  changedFields: updates as Record<string, any>,
                  summary:
                    eventType === 'SHOPIFY_CREATED'
                      ? 'Order Created'
                      : 'Order Updated',
                };
              }

              if (eventType === 'COURIER_STATUS_UPDATE') {
                if (payload.trackingNumber) {
                  await this.shipmentsRepo.upsertByOrderId(
                    orderId,
                    {
                      order: { connect: { orderId } },
                      trackingNumber: payload.trackingNumber,
                      courierStatus: payload.status || 'UNKNOWN',
                    },
                    tx,
                  );

                  // If we also had order updates, merge or overwrite?
                  // Let's issue a specific event if it's courier update.
                  // Assuming courier update handling falls here.
                  // If both happen, we might overwrite. But usually they are distinct events.
                  broadcastEvent = {
                    orderId,
                    serverTs: new Date().toISOString(),
                    changedFields: { courierStatus: payload.status },
                    summary: `Shipment Update: ${payload.status}`,
                  };
                }
              }

              // Mark processed
              if (inbox) {
                await this.eventInboxRepo.updateStatus(
                  inbox.id,
                  'PROCESSED',
                  new Date(),
                  tx,
                );
              }
            }
          }

          // 6. Delete message
          await tx.$executeRawUnsafe(
            `SELECT pgmq.delete($1::text, $2::bigint)`,
            this.QUEUE_NAME,
            msg_id,
          );
        },
        { timeout: 20000 },
      );

      if (broadcastEvent) {
        this.shipmentsService.broadcast(broadcastEvent);
      }
    } catch (err) {
      this.logger.error(`Failed to process message ${msg_id}`, err);
    }
  }
}
