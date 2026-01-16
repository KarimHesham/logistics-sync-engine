import { IsString, IsNotEmpty, IsObject } from "class-validator";

export class CreateEventRequestDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  payload!: Record<string, any>;
}
