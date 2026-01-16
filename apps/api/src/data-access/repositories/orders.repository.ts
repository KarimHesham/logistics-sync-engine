import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEntity } from '../entities/order.entity';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity | null> {
    const client = tx || this.prisma;
    return client.order.findUnique({
      where: { orderId },
    });
  }

  async findAll(tx?: Prisma.TransactionClient): Promise<OrderEntity[]> {
    const client = tx || this.prisma;
    return client.order.findMany();
  }

  async create(
    data: Prisma.OrderCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity> {
    const client = tx || this.prisma;
    return client.order.create({
      data,
    });
  }

  async update(
    orderId: string,
    data: Prisma.OrderUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity> {
    const client = tx || this.prisma;
    return client.order.update({
      where: { orderId },
      data,
    });
  }
}
