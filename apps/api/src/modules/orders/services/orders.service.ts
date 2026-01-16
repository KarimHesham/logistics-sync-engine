import { Injectable } from '@nestjs/common';
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

  async getOrders(): Promise<orders.OrderResponseDto[]> {
    const orderList = await this.ordersRepo.findAll();
    return ListMapper(orders.OrderResponseDto, orderList);
  }
}
