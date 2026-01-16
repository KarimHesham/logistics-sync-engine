import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ShipmentUpdateEvent {
  orderId: string;
  serverTs: string;
  changedFields: Record<string, any>;
  summary: string;
}

export interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
  retry?: number;
}

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  // Using a Subject to multicast events to all connected clients
  private events$ = new Subject<ShipmentUpdateEvent>();

  broadcast(event: ShipmentUpdateEvent) {
    this.logger.debug(
      `Broadcasting event for order ${event.orderId}: ${event.summary}`,
    );
    this.events$.next(event);
  }

  getStream(): Observable<MessageEvent> {
    return this.events$.asObservable().pipe(
      map((data) => {
        return {
          data: {
            orderId: data.orderId,
            serverTs: data.serverTs,
            changedFields: data.changedFields,
            summary: data.summary,
          },
          type: 'shipment_update', // Event type as requested
        };
      }),
    );
  }
}
