// Hand-finished in C-4 Session S3-2 (the scaffolder emitted a duplicate
// UpdateBookmarkDto class that referenced the wrong base DTO. See D-A-15).
//
// BookmarkTag is immutable post-creation (the (bookmark_id, tag) primary key
// IS the entity). There's no meaningful Update operation; the API exposes
// list/create/delete only per the blueprint. This file is kept (rather than
// deleted) for parallelism with other DTOs and in case a future schema
// addition wants a mutable tag attribute.
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBookmarkTagDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tag?: string;
}
