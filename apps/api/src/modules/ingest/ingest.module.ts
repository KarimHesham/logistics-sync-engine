import { Module } from '@nestjs/common';
import { IngestConsumer } from './providers/ingest-consumer.provider';
import { DataAccessModule } from '../../data-access';
import { ShipmentsModule } from '../shipments/shipments.module';

import { OutboundWorker } from './providers/outbound-worker.provider';

@Module({
  imports: [DataAccessModule, ShipmentsModule],
  providers: [IngestConsumer, OutboundWorker],
})
export class IngestModule {}
