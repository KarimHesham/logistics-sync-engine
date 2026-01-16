import { Shipment } from '@prisma/client';
import { BaseEntity } from './base.entity';

export class ShipmentEntity extends BaseEntity implements Shipment {
  orderOrderId: string;
  courierStatus: string;
  trackingNumber: string;
}
