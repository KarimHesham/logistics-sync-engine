import { Module } from '@nestjs/common';
import { CourierEventController } from './controllers/courier-event.controller';
import { EventInboxRepository } from '../../data-access/repositories/event-inbox.repository';

@Module({
  controllers: [CourierEventController],
  providers: [EventInboxRepository],
})
export class ShipmentsModule {}
