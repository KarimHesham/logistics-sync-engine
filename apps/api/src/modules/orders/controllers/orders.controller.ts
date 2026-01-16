import { Controller, Get, Param } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { orders } from '@repo/dtos';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(): Promise<orders.OrderResponseDto[]> {
    return this.ordersService.getOrders();
  }

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<orders.OrderResponseDto> {
    return this.ordersService.getOrder(id);
  }
}
