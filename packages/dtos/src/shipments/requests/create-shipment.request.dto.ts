import { IsString, IsNotEmpty } from "class-validator";

export class CreateShipmentRequestDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;
}
