import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventInboxEntity } from '../entities/event-inbox.entity';
import { Prisma } from '@prisma/client';

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

  async insertEvent(
    data: Omit<
      Prisma.EventInboxCreateInput,
      'id' | 'createdAt' | 'updatedAt' | 'processedAt' | 'deletedAt' | 'payload'
    > & { payload: unknown },
  ): Promise<{ inserted: boolean; id?: string }> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const event = await tx.eventInbox.create({
          data: {
            ...data,
            payload: data.payload as Prisma.InputJsonValue,
          },
        });

        await tx.$queryRaw`SELECT * FROM pgmq.send('ingest_events', ${data.payload}::jsonb, 0)`;

        return event;
      });

      return { inserted: true, id: result.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return { inserted: false };
        }
      }
      throw error;
    }
  }
}
