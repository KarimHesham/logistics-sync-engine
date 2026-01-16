import { Module } from '@nestjs/common';
import { IngestConsumer } from './providers/ingest-consumer.provider';
import { DataAccessModule } from '../../data-access';

@Module({
  imports: [DataAccessModule],
  providers: [IngestConsumer],
})
export class IngestModule {}
