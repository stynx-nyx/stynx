// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBookmarkDto {
  @IsString()
  @MaxLength(140)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recipient?: string;
}

