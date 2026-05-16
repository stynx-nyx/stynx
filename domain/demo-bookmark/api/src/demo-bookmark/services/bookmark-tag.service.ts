// C-4 Session S3-2 — service stub
//
// The scaffolder emitted a duplicated BookmarkService class (same body
// as services/bookmark.service.ts) under the bookmark-tag.service file —
// D-A-15. This rewrite gives BookmarkTagService its real shape.
//
// Tags are immutable post-creation (the (bookmark_id, tag) primary key
// IS the entity); only list/create/delete operations are exposed per
// the blueprint.

import { Injectable, NotImplementedException } from '@nestjs/common';
import type { BookmarkTag } from '../entities/bookmark.entity';
import type { CreateBookmarkTagDto } from '../dto/create-bookmark-tag.dto';

const STEP_2_HINT =
  'Hand-finish in C-4 Session S3-2-step-2: wire to @stynx/data Database + drizzle schema.';

@Injectable()
export class BookmarkTagService {
  findAll(_bookmarkId?: string): Promise<BookmarkTag[]> {
    throw new NotImplementedException(`BookmarkTagService.findAll: ${STEP_2_HINT}`);
  }

  create(_dto: CreateBookmarkTagDto): Promise<BookmarkTag> {
    throw new NotImplementedException(`BookmarkTagService.create: ${STEP_2_HINT}`);
  }

  remove(_bookmarkId: string, _tag: string): Promise<void> {
    throw new NotImplementedException(`BookmarkTagService.remove: ${STEP_2_HINT}`);
  }
}
