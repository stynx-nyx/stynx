// C-4 Session T2 — BookmarkService unit-test placeholder.
//
// The scaffolder emitted an Angular-shaped test (HttpClientTestingModule)
// for an API NestJS service — wrong mold entirely.
//
// This file establishes the test SHAPE (mocked Database + RequestContext)
// but the actual assertions are deferred to F-20 (per-task-DB integration
// session). Per-task-DB integration is the right granularity for a
// drizzle-backed service; mocking Database the way this stub does would
// just retread typed-equality of method signatures.

import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { BookmarkService } from '../src/demo-bookmark/services/bookmark.service';

describe('BookmarkService (unit shape)', () => {
  it('instantiates with Database + RequestContext dependencies', () => {
    const database = {} as unknown as Database;
    const context = { tenantId: 't1', actorId: 'u1' } as unknown as RequestContext;
    const svc = new BookmarkService(database, context);
    expect(svc).toBeDefined();
  });

  // F-20: real assertions live under a per-task-DB integration suite using
  // @stynx/testing's createTestApp + a provisioned DB. Stub for now to
  // signal the intent without bringing the @stynx/testing scaffolding into
  // T2's scope.
  it.todo('findAll returns tenant-scoped bookmarks (F-20: per-task-DB integration)');
  it.todo('create persists with current actor as owner (F-20)');
  it.todo('update + remove respect tenant scoping (F-20)');
});
