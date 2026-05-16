// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { BookmarkService } from '../services/bookmark.service';
import { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '../dto/update-bookmark.dto';
import { BookmarkPolicyGuard } from '../guards/policy.guard';
import { Resource, Action } from '../decorators/policy.decorator';

@Controller('/api/demo/bookmark/bookmark')
@Resource('bookmark')
@UseGuards(BookmarkPolicyGuard)
export class BookmarkController {
  constructor(private readonly service: BookmarkService) {}

  @Get()
  @Action('read')
  list() {
    return this.service.findAll();
  }

  @Get(':id')
  @Action('read')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Action('create')
  create(@Body() dto: CreateBookmarkDto) {
    // ownerId extraction from auth token should be added by scaffolder
    return this.service.create(dto);
  }

  @Put(':id')
  @Action('update')
  update(@Param('id') id: string, @Body() dto: UpdateBookmarkDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Action('delete')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
