import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterFileDto {
  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  objectKey!: string;

  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsOptional()
  mimeType?: string;
}
