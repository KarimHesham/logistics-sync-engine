import { Expose } from "class-transformer";

export class EventResponseDto {
  @Expose()
  id!: string;

  @Expose()
  type!: string;

  @Expose()
  timestamp!: Date;
}
