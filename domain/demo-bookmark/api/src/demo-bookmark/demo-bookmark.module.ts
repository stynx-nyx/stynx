// C-4 Session S3-2 — hand-finished module class
//
// The scaffolder emitted `class __NsModulePascal__Module {}` — an
// unsubstituted template variable. Filed as D-A-15.
//
// Hand-finishing for S3-2-step-2: when services are wired to
// @stynx/data, this module's imports list will grow to include
// the Database token provider + any rate-limit / audit module
// configuration. Today the providers are stub-shaped (services
// throw NotImplementedException; BookmarkPolicyGuard denies all).

import { Module } from '@nestjs/common';
import { BookmarkController } from './controllers/bookmark.controller';
import { BookmarkTagController } from './controllers/bookmark-tag.controller';
import { BookmarkService } from './services/bookmark.service';
import { BookmarkTagService } from './services/bookmark-tag.service';
import { BookmarkPolicyGuard } from './guards/policy.guard';

@Module({
  controllers: [BookmarkController, BookmarkTagController],
  providers: [BookmarkService, BookmarkTagService, BookmarkPolicyGuard],
  exports: [BookmarkService, BookmarkTagService],
})
export class DemoBookmarkModule {}
