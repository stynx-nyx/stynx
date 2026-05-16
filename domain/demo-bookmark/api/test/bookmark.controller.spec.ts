// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Test } from '@nestjs/testing';
import { BookmarkController } from './controllers/bookmark.controller';
import { BookmarkService } from './services/bookmark.service';

describe('BookmarkController', () => {
  it('compiles', async () => {
    const module = await Test.createTestingModule({
      controllers: [BookmarkController],
      providers: [{ provide: BookmarkService, useValue: {} }],
    }).compile();
    const ctrl = module.get(BookmarkController);
    expect(ctrl).toBeTruthy();
  });
});

