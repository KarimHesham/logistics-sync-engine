import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../../data-access/prisma/prisma.service';
import {
  PgmqRepository,
  PgmqMessage,
} from '../../../data-access/repositories/pgmq.repository';
import { TokenBucket } from '../utilities/token-bucket.util';

export interface OutboundPayload {
  orderId: string;
  changedFields: any;
  snapshot: any;
}

@Injectable()
export class OutboundWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboundWorker.name);
  private readonly QUEUE_NAME = 'shopify_outbound';
  private readonly bucket = new TokenBucket(2, 2);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pgmqRepo: PgmqRepository,
  ) {}

  async onModuleInit() {
    await this.pgmqRepo.createQueue(this.QUEUE_NAME);
    this.startPolling();
  }

  private startPolling() {
    this.pollLoop().catch((err) => {
      this.logger.error('Outbound polling failed, restarting...', err);
      setTimeout(() => this.startPolling(), 1000);
    });
  }

  private async pollLoop() {
    while (true) {
      try {
        const messages = await this.pgmqRepo.readWithPoll<OutboundPayload>(
          this.QUEUE_NAME,
          30,
          10,
          10,
          200,
        );

        if (messages.length === 0) {
          continue;
        }

        await Promise.allSettled(
          messages.map((msg) => this.processMessage(msg)),
        );
      } catch (error) {
        this.logger.error('Error during outbound poll loop', error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processMessage(msg: PgmqMessage<OutboundPayload>) {
    const { msg_id, message: payload } = msg;

    try {
      await this.bucket.removeToken();

      const orderId = payload.orderId;
      const baseUrl = process.env.MOCK_SHOPIFY_BASE_URL;

      if (!baseUrl) {
        this.logger.warn('MOCK_SHOPIFY_BASE_URL not set, skipping outbound');
        return;
      }

      const url = `${baseUrl}/admin/orders/${orderId}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? Number.parseInt(retryAfter, 10) : 1;
        this.logger.warn(
          `Rate limited for order ${orderId}, retrying after ${delay}s`,
        );

        await this.prisma.$transaction(async (tx) => {
          await this.pgmqRepo.send(this.QUEUE_NAME, payload, delay, tx);
          await this.pgmqRepo.delete(this.QUEUE_NAME, msg_id, tx);
        });
        return;
      }

      if (!response.ok) {
        this.logger.error(
          `Failed to send update for order ${orderId}: ${response.status} ${response.statusText}`,
        );
        return;
      }

      await this.pgmqRepo.delete(this.QUEUE_NAME, msg_id);
    } catch (err) {
      this.logger.error(`Failed to process outbound message ${msg_id}`, err);
    }
  }
}
