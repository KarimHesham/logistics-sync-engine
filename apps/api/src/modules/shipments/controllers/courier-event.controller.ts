import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { EventInboxRepository } from '../../../data-access/repositories/event-inbox.repository';
import { HashUtility } from '../../../common/utilities/hash.utility';
import type { CourierEventPayload } from '../../../common/types/webhook.types';

@Controller('events/courier')
export class CourierEventController {
  constructor(private readonly eventInboxRepo: EventInboxRepository) {}

  @Post('status_update')
  async handleCourierEvent(@Body() payload: CourierEventPayload) {
    // Expecting payload to have orderId, eventType, timestamp?
    // User request: "Validate: orderId, eventType, eventTs, payload"

    // I will assume payload structure for Courier:
    // { orderId: '...', eventType: '...', eventTs: '...', ...others }

    const { orderId, eventType, eventTs: eventTsStr } = payload;

    if (!orderId || !eventType || !eventTsStr) {
      throw new BadRequestException(
        'Missing required fields: orderId, eventType, eventTs',
      );
    }

    const eventTs = new Date(eventTsStr);
    const source = 'courier'; // Or derived from payload

    // Compute Dedupe Key: stable hash in this case as likely no header ID
    const dedupeKey = HashUtility.computeDedupeKey([
      source,
      orderId,
      eventType,
      eventTs.toISOString(),
      HashUtility.computeStableHash(payload),
    ]);

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
  }
}
