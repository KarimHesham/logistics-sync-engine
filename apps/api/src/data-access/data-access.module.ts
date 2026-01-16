import { Module, Global } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import {
  OrdersRepository,
  EventInboxRepository,
  PgmqRepository,
  ShipmentsRepository,
} from './repositories';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    OrdersRepository,
    EventInboxRepository,
    PgmqRepository,
    ShipmentsRepository,
  ],
  exports: [
    PrismaModule,
    OrdersRepository,
    EventInboxRepository,
    PgmqRepository,
    ShipmentsRepository,
  ],
})
export class DataAccessModule {}
