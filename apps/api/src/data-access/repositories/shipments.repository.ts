import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentEntity } from '../entities/shipment.entity';
import { Prisma } from '@prisma/client';

@Injectable()
export class ShipmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Removed incomplete upsert method relying on potential unique constraints not present.

  // Custom upsert implementation since we might lack a unique constraint on orderId in the schema visible earlier.
  async upsertByOrderId(
    orderId: string,
    data: Prisma.ShipmentCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ShipmentEntity> {
    const client = tx || this.prisma;
    // Attempt to find existing shipment for this order
    // LIMIT 1 since array is returned
    const existing = await client.shipment.findFirst({
      where: { orderOrderId: orderId },
    });

    if (existing) {
      return client.shipment.update({
        where: { id: existing.id },
        data: data,
      });
    } else {
      return client.shipment.create({
        data: data,
      });
    }
  }
}
