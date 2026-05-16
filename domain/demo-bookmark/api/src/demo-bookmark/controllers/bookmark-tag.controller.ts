// C-4 Session T2 — BookmarkTagController rewired to @stynx/auth canonical guards.

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { BookmarkTagService } from '../services/bookmark-tag.service';
import { CreateBookmarkTagDto } from '../dto/create-bookmark-tag.dto';

@Controller('/api/demo/bookmark/bookmark-tag')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class BookmarkTagController {
  constructor(private readonly service: BookmarkTagService) {}

  @Get()
  @ReadOnly()
  @Permission('demo:bookmark:read')
  list(@Query('bookmark_id') bookmarkId?: string) {
    return this.service.findAll(bookmarkId);
  }

  @Post()
  @Permission('demo:bookmark:write')
  create(@Body() dto: CreateBookmarkTagDto) {
    return this.service.create(dto);
  }

  @Delete(':bookmark_id/:tag')
  @Permission('demo:bookmark:write')
  remove(@Param('bookmark_id') bookmarkId: string, @Param('tag') tag: string) {
    return this.service.remove(bookmarkId, tag);
  }
}
