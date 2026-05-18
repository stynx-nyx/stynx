// C-4 Session F-9 step 2/N — BookmarkTagService per-task-DB integration.
//
// Replaces the T2 unit-shape stub + 3 it.todo placeholders with real
// drizzle queries. Shares the demo-bookmark fixture with bookmark.service.spec
// (each spec file gets its own fresh DB via createDemoBookmarkFixture).

import { NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { BookmarkService } from '../src/demo-bookmark/services/bookmark.service';
import { BookmarkTagService } from '../src/demo-bookmark/services/bookmark-tag.service';
import { createDemoBookmarkFixture, type DemoBookmarkFixture } from './support/postgres-fixture';


describe('BookmarkTagService (per-task-DB integration)', () => {
  let fixture: DemoBookmarkFixture;

  beforeAll(async () => {
    fixture = await createDemoBookmarkFixture();
  });

  afterAll(async () => {
    if (fixture) await fixture.dispose();
  });

  it('instantiates with Database + RequestContext dependencies', async () => {
    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const svc = new BookmarkTagService(db, ctx);
      expect(svc).toBeDefined();
    });
  });

  it('findAll returns tag rows joined via parent tenant scope (F-20)', async () => {
    // Seed: tenant A has 1 bookmark with 2 tags; tenant B has 1 bookmark with 1 tag.
    const aBookmark = await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const bookmarkSvc = new BookmarkService(db, ctx);
      const tagSvc = new BookmarkTagService(db, ctx);
      const bm = await bookmarkSvc.create({ url: 'https://tag-a.example/', title: 'A', notes: null });
      const id = (bm as { id: string }).id;
      await tagSvc.create({ bookmark_id: id, tag: 'rust' });
      await tagSvc.create({ bookmark_id: id, tag: 'systems' });
      return id;
    });
    await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const bookmarkSvc = new BookmarkService(db, ctx);
      const tagSvc = new BookmarkTagService(db, ctx);
      const bm = await bookmarkSvc.create({ url: 'https://tag-b.example/', title: 'B', notes: null });
      await tagSvc.create({ bookmark_id: (bm as { id: string }).id, tag: 'b-only' });
    });

    // Tenant A's findAll (no filter) must see only A's 2 tags, never B's 'b-only'.
    const aTags = await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const tagSvc = new BookmarkTagService(db, ctx);
      return tagSvc.findAll();
    });
    const labels = (aTags as Array<{ tag: string }>).map((t) => t.tag).sort();
    expect(labels).toEqual(['rust', 'systems']);
    expect(labels).not.toContain('b-only');

    // Filter by aBookmark id still returns those 2 tags.
    const aFiltered = await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const tagSvc = new BookmarkTagService(db, ctx);
      return tagSvc.findAll(aBookmark);
    });
    expect((aFiltered as Array<{ tag: string }>).map((t) => t.tag).sort()).toEqual(['rust', 'systems']);
  });

  it('create rejects cross-tenant bookmark_id (F-20)', async () => {
    // Tenant B owns a bookmark; tenant A tries to tag it — must throw NotFoundException.
    const bBookmark = await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const svc = new BookmarkService(db, ctx);
      const bm = await svc.create({ url: 'https://cross-tag.example/', title: null, notes: null });
      return (bm as { id: string }).id;
    });
    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const tagSvc = new BookmarkTagService(db, ctx);
      await expect(tagSvc.create({ bookmark_id: bBookmark, tag: 'hijack' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('remove enforces tenant scope before delete (F-20)', async () => {
    // Tenant B creates a bookmark + tag; tenant A tries to remove that tag — must throw.
    const ctxB = await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const bookmarkSvc = new BookmarkService(db, ctx);
      const tagSvc = new BookmarkTagService(db, ctx);
      const bm = await bookmarkSvc.create({ url: 'https://remove-scope.example/', title: null, notes: null });
      const id = (bm as { id: string }).id;
      await tagSvc.create({ bookmark_id: id, tag: 'protected' });
      return id;
    });

    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const tagSvc = new BookmarkTagService(db, ctx);
      await expect(tagSvc.remove(ctxB, 'protected')).rejects.toBeInstanceOf(NotFoundException);
    });

    // Confirm tenant B's tag is still present.
    const stillThere = await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<RequestContext>(RequestContext);
      const tagSvc = new BookmarkTagService(db, ctx);
      return tagSvc.findAll(ctxB);
    });
    expect((stillThere as Array<{ tag: string }>).map((t) => t.tag)).toContain('protected');
  });
});
