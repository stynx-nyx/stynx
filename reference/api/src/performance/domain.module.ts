import { Module } from '@nestjs/common';
import { DemoBookmarkModule } from '@stynx-domain/demo-bookmark-api/dist/domain/demo-bookmark/api/src/demo-bookmark/demo-bookmark.module.js';
import { AppModule } from '../app.module';

@Module({
  imports: [AppModule, DemoBookmarkModule],
})
export class DomainApplicationModule {}
