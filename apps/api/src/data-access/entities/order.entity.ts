export class OrderEntity {
  id: string;
  orderId: string;
  customerId: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
