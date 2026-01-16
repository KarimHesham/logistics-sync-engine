import { Controller, Sse } from '@nestjs/common';
import { ShipmentsService, MessageEvent } from '../services/shipments.service';
import { Observable } from 'rxjs';

@Controller('stream')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Sse('shipments')
  stream(): Observable<MessageEvent> {
    return this.shipmentsService.getStream();
  }
}
