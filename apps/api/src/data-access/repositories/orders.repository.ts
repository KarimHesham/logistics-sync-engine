import { Injectable } from '@nestjs/common';
import { OrderEntity } from '../entities/order.entity';

@Injectable()
export class OrdersRepository {
  private readonly orders: OrderEntity[] = [
    {
      id: '1',
      orderId: 'ORD-001',
      customerId: 'CUST-001',
      totalAmount: 100,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      orderId: 'ORD-002',
      customerId: 'CUST-002',
      totalAmount: 200,
      status: 'SHIPPED',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  async findByOrderId(orderId: string): Promise<OrderEntity | null> {
    return Promise.resolve(
      this.orders.find((o) => o.orderId === orderId) || null,
    );
  }

  async findAll(): Promise<OrderEntity[]> {
    return Promise.resolve(this.orders);
  }

  async create(order: Partial<OrderEntity>): Promise<OrderEntity> {
    const newOrder = {
      ...order,
      id: Math.random().toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as OrderEntity;
    this.orders.push(newOrder);
    return Promise.resolve(newOrder);
  }
}
