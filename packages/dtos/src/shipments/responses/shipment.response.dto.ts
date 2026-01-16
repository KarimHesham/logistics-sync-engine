import { Expose } from "class-transformer";

export class ShipmentResponseDto {
  @Expose()
  id!: string;

  @Expose()
  orderId!: string;

  @Expose()
  trackingNumber!: string;

  @Expose()
  status!: string;
}
