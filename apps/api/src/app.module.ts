import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DataAccessModule } from './data-access/data-access.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { IngestModule } from './modules/ingest/ingest.module';

@Module({
  imports: [DataAccessModule, OrdersModule, ShipmentsModule, IngestModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
