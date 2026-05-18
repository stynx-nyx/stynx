// C-4 Session T2 — BookmarkController route-binding test.
//
// Replaces the scaffolder stub (which had wrong relative import paths).
// A per-task-DB integration test belongs in a follow-up F-20 session;
// this spec validates the DI graph + controller-to-service delegation only.

import { Test } from '@nestjs/testing';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { BookmarkController } from '../src/demo-bookmark/controllers/bookmark.controller';
import { BookmarkService } from '../src/demo-bookmark/services/bookmark.service';

describe('BookmarkController', () => {
  const fakeBookmark = {
    id: '00000000-0000-4000-8000-000000bk0001',
    tenantId: 't1',
    ownerId: 'u1',
    url: 'https://example.com',
    title: 'Example',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  let controller: BookmarkController;
  let service: Record<string, Mock>;

  beforeEach(async () => {
    service = {
      findAll: vi.fn().mockResolvedValue([fakeBookmark]),
      findOne: vi.fn().mockResolvedValue(fakeBookmark),
      create: vi.fn().mockResolvedValue(fakeBookmark),
      update: vi.fn().mockResolvedValue(fakeBookmark),
      remove: vi.fn().mockResolvedValue({ status: 'soft-deleted', id: fakeBookmark.id }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [BookmarkController],
      providers: [{ provide: BookmarkService, useValue: service }],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(BookmarkController);
    void Permission; // touch the import so it isn't tree-shaken from coverage
  });

  it('compiles', () => {
    expect(controller).toBeDefined();
  });

  it('list() delegates to service.findAll', async () => {
    const result = await controller.list(10);
    expect(service['findAll']).toHaveBeenCalledWith(10);
    expect(result).toEqual([fakeBookmark]);
  });

  it('get(:id) delegates to service.findOne', async () => {
    const result = await controller.get(fakeBookmark.id);
    expect(service['findOne']).toHaveBeenCalledWith(fakeBookmark.id);
    expect(result).toEqual(fakeBookmark);
  });

  it('create(body) delegates to service.create', async () => {
    const body = { url: 'https://example.com', title: 'Example' };
    const result = await controller.create(body);
    expect(service['create']).toHaveBeenCalledWith(body);
    expect(result).toEqual(fakeBookmark);
  });

  it('update(:id, body) delegates to service.update', async () => {
    const body = { title: 'Renamed' };
    const result = await controller.update(fakeBookmark.id, body);
    expect(service['update']).toHaveBeenCalledWith(fakeBookmark.id, body);
    expect(result).toEqual(fakeBookmark);
  });

  it('remove(:id) delegates to service.remove', async () => {
    const result = await controller.remove(fakeBookmark.id);
    expect(service['remove']).toHaveBeenCalledWith(fakeBookmark.id);
    expect(result).toEqual({ status: 'soft-deleted', id: fakeBookmark.id });
  });
});
