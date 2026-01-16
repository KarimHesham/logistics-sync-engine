import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEntity } from '../entities/order.entity';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrderId(orderId: string): Promise<OrderEntity | null> {
    return this.prisma.order.findUnique({
      where: { orderId },
    });
  }

  async findAll(): Promise<OrderEntity[]> {
    return this.prisma.order.findMany();
  }

  async create(data: Prisma.OrderCreateInput): Promise<OrderEntity> {
    return this.prisma.order.create({
      data,
    });
  }
}
