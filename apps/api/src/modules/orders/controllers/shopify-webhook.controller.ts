import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { EventInboxRepository } from '../../../data-access/repositories/event-inbox.repository';
import { HashUtility } from '../../../common/utilities/hash.utility';
import type { ShopifyOrderPayload } from '../../../common/types/webhook.types';

@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  constructor(private readonly eventInboxRepo: EventInboxRepository) {}

  @Post('orders')
  async handleOrderWebhook(
    @Body() payload: ShopifyOrderPayload,
    @Headers('x-shopify-webhook-id') webhookId?: string,
    @Headers('x-shopify-topic') topic?: string,
  ) {
    // 1. Validate / Extract
    const orderId = payload.id?.toString();
    const eventType = topic || 'unknown';
    // Use updated_at or created_at or now
    const eventTsStr =
      payload.updated_at || payload.created_at || new Date().toISOString();
    const eventTs = new Date(eventTsStr);

    if (!orderId) {
      throw new BadRequestException('Missing orderId in payload');
    }

    // 2. Compute Dedupe Key
    const source = 'shopify';
    let dedupeKey: string;

    if (webhookId) {
      dedupeKey = `${source}:${webhookId}`;
    } else {
      dedupeKey = HashUtility.computeDedupeKey([
        source,
        orderId,
        eventType,
        eventTs.toISOString(),
        HashUtility.computeStableHash(payload),
      ]);
    }

    // 3. Insert & Enqueue
    try {
      const result = await this.eventInboxRepo.insertEvent({
        dedupeKey,
        source,
        orderId,
        eventType,
        eventTs,
        payload,
        status: 'RECEIVED',
      });

      if (!result.inserted) {
        return { status: 'Duplicate ignored' };
      }

      return { status: 'Accepted', id: result.id };
    } catch (e: unknown) {
      if (e instanceof Error) {
        return { status: 'Error', message: e.message, stack: e.stack };
      }
      return { status: 'Error', message: 'Unknown error' };
    }
  }
}
