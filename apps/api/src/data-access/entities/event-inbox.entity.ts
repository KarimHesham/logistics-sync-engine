import { EventInbox, Prisma } from '@prisma/client';
import { BaseEntity } from './base.entity';

export class EventInboxEntity extends BaseEntity implements EventInbox {
  dedupeKey: string;
  source: string;
  orderId: string;
  eventType: string;
  eventTs: Date;
  payload: Prisma.JsonValue;
  status: string;
  processedAt: Date | null;
}
