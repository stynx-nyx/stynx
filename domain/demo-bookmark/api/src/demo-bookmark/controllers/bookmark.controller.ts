// C-4 Session T2 — BookmarkController rewired to @stynx/auth canonical guards.
//
// Replaces the scaffolder-emitted local BookmarkPolicyGuard + @Resource/@Action
// stubs with the stynx pattern from reference/api/src/sample/records.controller.ts:
// @UseGuards(StynxAuthGuard, PermissionGuard) at the class level, @Permission(...)
// per method, @ReadOnly() on GETs.

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { BookmarkService } from '../services/bookmark.service';
import { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '../dto/update-bookmark.dto';

@Controller('/api/demo/bookmark/bookmark')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class BookmarkController {
  constructor(private readonly service: BookmarkService) {}

  @Get()
  @ReadOnly()
  @Permission('demo:bookmark:read')
  list(@Query('limit') limit?: number) {
    return this.service.findAll(limit);
  }

  @Get(':id')
  @ReadOnly()
  @Permission('demo:bookmark:read')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Permission('demo:bookmark:write')
  create(@Body() dto: CreateBookmarkDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Permission('demo:bookmark:write')
  update(@Param('id') id: string, @Body() dto: UpdateBookmarkDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permission('demo:bookmark:write')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
