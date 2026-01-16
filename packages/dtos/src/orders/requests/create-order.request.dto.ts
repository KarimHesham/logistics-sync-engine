import { IsString, IsNotEmpty, IsNumber, Min } from "class-validator";

export class CreateOrderRequestDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsNumber()
  @Min(0)
  totalAmount!: number;
}
