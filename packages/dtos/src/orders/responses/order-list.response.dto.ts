import { Expose, Type } from "class-transformer";
import { ShipmentResponseDto } from "../../shipments/responses/shipment.response.dto";

export class OrderListResponseDto {
  @Expose()
  id!: string;

  @Expose()
  orderId!: string;

  @Expose()
  customerId!: string;

  @Expose()
  totalAmount!: number;

  @Expose()
  status!: string;

  @Expose()
  @Type(() => ShipmentResponseDto)
  shipments!: ShipmentResponseDto[];
}
