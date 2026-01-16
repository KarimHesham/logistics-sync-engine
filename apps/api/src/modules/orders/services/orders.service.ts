import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersRepository } from '../../../data-access/repositories/orders.repository';
import { orders } from '@repo/dtos';
import { ListMapper, Mapper } from '../../../common/mappers';

@Injectable()
export class OrdersService {
  constructor(private readonly ordersRepo: OrdersRepository) {}

  async getOrder(orderId: string): Promise<orders.OrderResponseDto> {
    const order = await this.ordersRepo.findByOrderId(orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    return Mapper(orders.OrderResponseDto, order);
  }

  async getOrders(
    limit: number,
    cursor?: string,
  ): Promise<orders.OrderListResponseDto[]> {
    const params: {
      take?: number;
      skip?: number;
      cursor?: Prisma.OrderWhereUniqueInput;
    } = { take: limit };
    if (cursor) {
      params.cursor = { orderId: cursor };
      params.skip = 1;
    }
    const orderList = await this.ordersRepo.findAll(params);
    return ListMapper(orders.OrderListResponseDto, orderList);
  }
}
