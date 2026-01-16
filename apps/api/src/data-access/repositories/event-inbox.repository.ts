import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventInboxEntity } from '../entities/event-inbox.entity';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: Prisma.EventInboxCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<EventInboxEntity> {
    const client = tx || this.prisma;
    return await client.eventInbox.create({
      data,
    });
  }

  async findByDedupeKey(
    dedupeKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EventInboxEntity | null> {
    const client = tx || this.prisma;
    return await client.eventInbox.findUnique({
      where: { dedupeKey },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    processedAt: Date | null,
    tx?: Prisma.TransactionClient,
  ): Promise<EventInboxEntity> {
    const client = tx || this.prisma;
    return await client.eventInbox.update({
      where: { id },
      data: { status, processedAt },
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

        const message = {
          ...(typeof data.payload === 'object' ? data.payload : {}),
          orderId: data.orderId,
          dedupeKey: data.dedupeKey,
          eventType: data.eventType,
          eventTs: data.eventTs,
        };

        // Use Prisma.sql for safer parameterization and type handling
        await tx.$queryRaw(
          Prisma.sql`SELECT pgmq.send('ingest_events', ${message}::jsonb, 0)`,
        );

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
