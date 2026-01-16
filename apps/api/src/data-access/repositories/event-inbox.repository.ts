import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventInboxEntity } from '../entities/event-inbox.entity';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class EventInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.EventInboxCreateInput): Promise<EventInboxEntity> {
    return await this.prisma.eventInbox.create({
      data,
    });
  }

  async findByDedupeKey(dedupeKey: string): Promise<EventInboxEntity | null> {
    return await this.prisma.eventInbox.findUnique({
      where: { dedupeKey },
    });
  }
}
