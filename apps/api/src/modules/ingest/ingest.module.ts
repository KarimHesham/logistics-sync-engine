import { Module } from '@nestjs/common';
import { IngestConsumer } from './providers/ingest-consumer.provider';
import { DataAccessModule } from '../../data-access';

import { OutboundWorker } from './providers/outbound-worker.provider';

@Module({
  imports: [DataAccessModule],
  providers: [IngestConsumer, OutboundWorker],
})
export class IngestModule {}
