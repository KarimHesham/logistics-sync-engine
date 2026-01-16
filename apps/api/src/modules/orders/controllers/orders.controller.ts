import { Controller, Get, Param, Query } from '@nestjs/common';
import { OrdersService } from '../services/orders.service';
import { orders } from '@repo/dtos';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(
    @Query('limit') limitArg?: string,
    @Query('cursor') cursor?: string,
  ): Promise<orders.OrderListResponseDto[]> {
    const limit = limitArg ? parseInt(limitArg, 10) : 100;
    return this.ordersService.getOrders(limit, cursor);
  }

  @Get(':id')
  async getOrder(@Param('id') id: string): Promise<orders.OrderResponseDto> {
    return this.ordersService.getOrder(id);
  }
}
