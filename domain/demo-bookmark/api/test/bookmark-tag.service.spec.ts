// C-4 Session T2 — BookmarkTagService unit-test placeholder.
// Same shape as bookmark.service.spec.ts; per-task-DB assertions land in F-20.

import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { BookmarkTagService } from '../src/demo-bookmark/services/bookmark-tag.service';

describe('BookmarkTagService (unit shape)', () => {
  it('instantiates with Database + RequestContext dependencies', () => {
    const database = {} as unknown as Database;
    const context = { tenantId: 't1', actorId: 'u1' } as unknown as RequestContext;
    const svc = new BookmarkTagService(database, context);
    expect(svc).toBeDefined();
  });

  it.todo('findAll returns tag rows joined via parent tenant scope (F-20)');
  it.todo('create rejects cross-tenant bookmark_id (F-20)');
  it.todo('remove enforces tenant scope before delete (F-20)');
});
