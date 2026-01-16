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
      include: { shipments: true },
    }) as unknown as OrderEntity | null;
  }

  async findAll(
    params: {
      skip?: number;
      take?: number;
      cursor?: Prisma.OrderWhereUniqueInput;
      where?: Prisma.OrderWhereInput;
      orderBy?: Prisma.OrderOrderByWithRelationInput;
    } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity[]> {
    const { skip, take, cursor, where, orderBy } = params;
    const client = tx || this.prisma;
    return client.order.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
      include: {
        shipments: true,
      },
    }) as unknown as OrderEntity[];
  }

  async create(
    data: Prisma.OrderCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity> {
    const client = tx || this.prisma;
    return client.order.create({
      data,
      include: { shipments: true },
    }) as unknown as OrderEntity;
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
      include: { shipments: true },
    }) as unknown as OrderEntity;
  }
}
