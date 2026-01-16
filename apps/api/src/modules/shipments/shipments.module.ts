import { Module } from '@nestjs/common';
import { CourierEventController } from './controllers/courier-event.controller';
import { ShipmentsController } from './controllers/shipments.controller';
import { EventInboxRepository } from '../../data-access/repositories/event-inbox.repository';
import { ShipmentsService } from './services/shipments.service';

@Module({
  controllers: [CourierEventController, ShipmentsController],
  providers: [EventInboxRepository, ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
