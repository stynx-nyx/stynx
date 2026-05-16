// C-4 Session T2 — post-T2 module wiring
//
// Services + controllers now use @stynx/data Database + @stynx/auth's
// canonical StynxAuthGuard + PermissionGuard pattern (per controllers).
// Local guards/decorators/ subdirs deleted in T2 — no longer needed.

import { Module } from '@nestjs/common';
import { BookmarkController } from './controllers/bookmark.controller';
import { BookmarkTagController } from './controllers/bookmark-tag.controller';
import { BookmarkService } from './services/bookmark.service';
import { BookmarkTagService } from './services/bookmark-tag.service';

@Module({
  controllers: [BookmarkController, BookmarkTagController],
  providers: [BookmarkService, BookmarkTagService],
  exports: [BookmarkService, BookmarkTagService],
})
export class DemoBookmarkModule {}
