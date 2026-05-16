// Hand-finished in C-4 Session S3-2 (replaces SKILL-scaffold-api template
// which emitted wrong fields — generic "message"/"recipient" instead of the
// blueprint's title/url/notes. See D-A-15 for the underlying scaffolder gap.)
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateBookmarkDto {
  @IsUrl({}, { message: 'url must be a valid URL' })
  @MaxLength(2048)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
