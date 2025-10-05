import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateTenancyDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}
