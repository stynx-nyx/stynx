// C-4 Session T2 — BookmarkTagController route-binding test.

import { Test } from '@nestjs/testing';
import { PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { BookmarkTagController } from '../src/demo-bookmark/controllers/bookmark-tag.controller';
import { BookmarkTagService } from '../src/demo-bookmark/services/bookmark-tag.service';

describe('BookmarkTagController', () => {
  const fakeTag = {
    bookmarkId: '00000000-0000-4000-8000-000000bk0001',
    tag: 'devai',
    createdAt: new Date(),
  };

  let controller: BookmarkTagController;
  let service: Record<string, Mock>;

  beforeEach(async () => {
    service = {
      findAll: vi.fn().mockResolvedValue([fakeTag]),
      create: vi.fn().mockResolvedValue(fakeTag),
      remove: vi.fn().mockResolvedValue({ status: 'deleted', bookmarkId: fakeTag.bookmarkId, tag: fakeTag.tag }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [BookmarkTagController],
      providers: [{ provide: BookmarkTagService, useValue: service }],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(BookmarkTagController);
  });

  it('compiles', () => {
    expect(controller).toBeDefined();
  });

  it('list(bookmark_id) delegates to service.findAll', async () => {
    const result = await controller.list(fakeTag.bookmarkId);
    expect(service['findAll']).toHaveBeenCalledWith(fakeTag.bookmarkId);
    expect(result).toEqual([fakeTag]);
  });

  it('create(body) delegates to service.create', async () => {
    const body = { bookmark_id: fakeTag.bookmarkId, tag: fakeTag.tag };
    const result = await controller.create(body);
    expect(service['create']).toHaveBeenCalledWith(body);
    expect(result).toEqual(fakeTag);
  });

  it('remove(bookmark_id, tag) delegates to service.remove', async () => {
    const result = await controller.remove(fakeTag.bookmarkId, fakeTag.tag);
    expect(service['remove']).toHaveBeenCalledWith(fakeTag.bookmarkId, fakeTag.tag);
    expect(result).toEqual({ status: 'deleted', bookmarkId: fakeTag.bookmarkId, tag: fakeTag.tag });
  });
});
