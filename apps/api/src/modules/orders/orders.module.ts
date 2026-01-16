import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { OrdersService } from './services/orders.service';
import { OrdersRepository } from '../../data-access/repositories/orders.repository';
import { ShopifyWebhookController } from './controllers/shopify-webhook.controller';
import { EventInboxRepository } from '../../data-access/repositories/event-inbox.repository';

@Module({
  controllers: [OrdersController, ShopifyWebhookController],
  providers: [OrdersService, OrdersRepository, EventInboxRepository],
})
export class OrdersModule {}
