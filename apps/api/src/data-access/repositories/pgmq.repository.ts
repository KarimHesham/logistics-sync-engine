import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PgmqMessage<T = unknown> {
  msg_id: number;
  read_ct: number;
  enqueued_at: Date;
  vt: Date;
  message: T;
}

@Injectable()
export class PgmqRepository {
  constructor(private readonly prisma: PrismaService) {}

  async readWithPoll<T = unknown>(
    queue: string,
    vt: number,
    qty: number,
    maxPollSeconds: number,
    pollIntervalMs: number,
  ): Promise<PgmqMessage<T>[]> {
    return await this.prisma.$queryRawUnsafe<PgmqMessage<T>[]>(
      `SELECT * FROM pgmq.read_with_poll($1, $2, $3, $4, $5)`,
      queue,
      vt,
      qty,
      maxPollSeconds,
      pollIntervalMs,
    );
  }

  async delete(queue: string, msgId: number): Promise<boolean> {
    await this.prisma.$executeRawUnsafe(
      `SELECT pgmq.delete($1, $2)`,
      queue,
      msgId,
    );
    // Return true for now as we are not using the result
    return true;
  }

  async advisoryLock(key: number, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock($1)`, key);
  }

  async advisoryLockForOrder(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      orderId,
    );
  }
}
