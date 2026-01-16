import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OrdersModule } from './modules/orders';
import { PrismaModule } from 'src/data-access';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
