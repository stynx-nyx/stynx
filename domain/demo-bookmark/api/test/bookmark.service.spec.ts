// C-4 Session F-9 step 2/N — BookmarkService per-task-DB integration.
//
// Replaces the T2 unit-shape stub + 3 it.todo placeholders with real
// drizzle queries against a fresh Postgres database per test file.
// Uses the platform migration runner (StynxDataModule.forRoot({migrations:
// {enabled:true}})) + applies domain/demo-bookmark/db/migration.sql on top.

import { NotFoundException } from '@nestjs/common';
import { BookmarkService } from '../src/demo-bookmark/services/bookmark.service';
import { createDemoBookmarkFixture, type DemoBookmarkFixture } from './support/postgres-fixture';

jest.setTimeout(120_000);

describe('BookmarkService (per-task-DB integration)', () => {
  let fixture: DemoBookmarkFixture;

  beforeAll(async () => {
    fixture = await createDemoBookmarkFixture();
  });

  afterAll(async () => {
    if (fixture) await fixture.dispose();
  });

  // Shape check kept from the T2 stub — verifies the constructor signature
  // still matches the @stynx/data + @stynx/core injection contract.
  it('instantiates with Database + RequestContext dependencies', async () => {
    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      expect(svc).toBeDefined();
    });
  });

  it('findAll returns tenant-scoped bookmarks (F-20)', async () => {
    // Seed: 2 bookmarks in tenant A + 1 in tenant B.
    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      await svc.create({ url: 'https://a1.example/', title: 'A1', notes: null });
      await svc.create({ url: 'https://a2.example/', title: 'A2', notes: null });
    });
    await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      await svc.create({ url: 'https://b1.example/', title: 'B1', notes: null });
    });

    // Read from tenant A: must see exactly 2 (A1 + A2), not B1.
    const aRows = await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      return svc.findAll();
    });
    expect(aRows).toHaveLength(2);
    expect(aRows.every((r) => (r as { tenantId: string }).tenantId === fixture.tenantA)).toBe(true);
    const urls = (aRows as Array<{ url: string }>).map((r) => r.url).sort();
    expect(urls).toEqual(['https://a1.example/', 'https://a2.example/']);
  });

  it('create persists with current actor as owner (F-20)', async () => {
    const created = await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      return svc.create({ url: 'https://owner-check.example/', title: 'owner-check', notes: null });
    });
    expect((created as { tenantId: string }).tenantId).toBe(fixture.tenantA);
    expect((created as { ownerId: string }).ownerId).toBe(fixture.userA);
    expect((created as { url: string }).url).toBe('https://owner-check.example/');
  });

  it('update + remove respect tenant scoping (F-20)', async () => {
    // Seed one bookmark in tenant B.
    const bRow = await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      return svc.create({ url: 'https://b-scoping.example/', title: 'B scoping', notes: null });
    });
    const bId = (bRow as { id: string }).id;

    // From tenant A, both update and remove of tenant B's bookmark must throw NotFoundException.
    await fixture.runAs(fixture.tenantA, fixture.userA, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      await expect(svc.update(bId, { title: 'hijacked' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.remove(bId)).rejects.toBeInstanceOf(NotFoundException);
    });

    // Confirm the row is still present + unchanged under tenant B.
    const stillThere = await fixture.runAs(fixture.tenantB, fixture.userB, async (db) => {
      const ctx = fixture.module.get<import('@stynx/core').RequestContext>(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@stynx/core').RequestContext,
      );
      const svc = new BookmarkService(db, ctx);
      return svc.findOne(bId);
    });
    expect((stillThere as { title: string | null }).title).toBe('B scoping');
  });
});
