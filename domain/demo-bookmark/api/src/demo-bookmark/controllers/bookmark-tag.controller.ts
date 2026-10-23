// C-4 Session T2 — BookmarkTagController rewired to @stynx-nyx/auth canonical guards.

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx-nyx/auth';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { BookmarkTagService } from '../services/bookmark-tag.service.js';
import { CreateBookmarkTagDto } from '../dto/create-bookmark-tag.dto.js';

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
  // Preserve the service's per-request transaction, without a key or replay contract.
  @NoIdempotent()
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
