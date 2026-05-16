// C-4 Session S3-2 — hand-finished controller
//
// The scaffolder emitted a duplicate BookmarkController in this file with
// the same body as controllers/bookmark.controller.ts. Filed as D-A-15.
// This rewrite gives BookmarkTagController its real shape: list/create/
// delete only (tags are immutable post-creation; (bookmark_id, tag) is
// the primary key).

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookmarkTagService } from '../services/bookmark-tag.service';
import { CreateBookmarkTagDto } from '../dto/create-bookmark-tag.dto';
import { BookmarkPolicyGuard } from '../guards/policy.guard';
import { Resource, Action } from '../decorators/policy.decorator';

@Controller('/api/demo/bookmark/bookmark-tag')
@Resource('bookmark-tag')
@UseGuards(BookmarkPolicyGuard)
export class BookmarkTagController {
  constructor(private readonly service: BookmarkTagService) {}

  @Get()
  @Action('read')
  list(@Query('bookmark_id') bookmarkId?: string) {
    return this.service.findAll(bookmarkId);
  }

  @Post()
  @Action('create')
  create(@Body() dto: CreateBookmarkTagDto) {
    return this.service.create(dto);
  }

  @Delete(':bookmark_id/:tag')
  @Action('delete')
  remove(@Param('bookmark_id') bookmarkId: string, @Param('tag') tag: string) {
    return this.service.remove(bookmarkId, tag);
  }
}
