import { Order } from '@prisma/client';
import { BaseEntity } from './base.entity';

export class OrderEntity extends BaseEntity implements Order {
  orderId: string;
  customerId: string;
  status: string;
  totalAmount: number;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  shippingFeeCents: number;
  lastEventTs: Date;
}
