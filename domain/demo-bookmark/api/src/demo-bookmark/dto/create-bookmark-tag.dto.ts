// Hand-finished in C-4 Session S3-2 (replaces SKILL-scaffold-api template
// which emitted wrong fields — generic "message"/"recipient" instead of the
// blueprint's bookmark_id/tag, and duplicated CreateBookmarkDto class name.
// See D-A-15.)
import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateBookmarkTagDto {
  @IsUUID('4')
  bookmark_id!: string;

  @IsString()
  @Matches(/^[a-z0-9_-]{1,64}$/i, { message: 'tag must be 1-64 chars, alphanumeric/underscore/hyphen' })
  @MaxLength(64)
  tag!: string;
}
