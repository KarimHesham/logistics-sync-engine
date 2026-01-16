import { Expose } from "class-transformer";

export class OrderResponseDto {
  @Expose()
  id!: string;

  @Expose()
  customerId!: string;

  @Expose()
  totalAmount!: number;

  @Expose()
  status!: string;
}
