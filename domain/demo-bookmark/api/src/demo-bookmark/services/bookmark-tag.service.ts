// C-4 Session T2 — BookmarkTagService wired to @stynx/data
//
// Replaces the S3-2 NotImplementedException stubs. Tags are immutable
// post-creation per the blueprint; only list/create/delete operations
// are exposed. Composite (bookmark_id, tag) is the primary key.

import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { and, eq } from 'drizzle-orm';
import { bookmarks, bookmarkTags } from '../schema';
import type { CreateBookmarkTagDto } from '../dto/create-bookmark-tag.dto';

@Injectable()
export class BookmarkTagService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
  ) {}

  async findAll(bookmarkId?: string) {
    return this.database.tx(
      async (trx) => {
        const tenantId = this.requireTenantId();
        // Tenancy: bookmarkTags has no tenant_id column. Two-step query to
        // enforce tenant scoping via the parent bookmarks row, since
        // @stynx/data's Transaction type doesn't surface drizzle's innerJoin
        // typings cleanly here.
        const tenantBookmarks = await trx
          .select()
          .from(bookmarks)
          .where(
            bookmarkId !== undefined
              ? and(eq(bookmarks.tenantId, tenantId), eq(bookmarks.id, bookmarkId))
              : eq(bookmarks.tenantId, tenantId),
          );
        if (tenantBookmarks.length === 0) return [];
        // softDeletable wrapper obscures column inference here; cast explicitly.
        const ids = tenantBookmarks.map((b) => (b as { id: string }).id);
        if (bookmarkId !== undefined) {
          return trx
            .select()
            .from(bookmarkTags)
            .where(eq(bookmarkTags.bookmarkId, bookmarkId));
        }
        const allTags = (await trx.select().from(bookmarkTags)) as Array<{ bookmarkId: string; tag: string; createdAt: Date }>;
        return allTags.filter((t) => ids.includes(t.bookmarkId));
      },
      { role: 'reader', readonly: true },
    );
  }

  async create(dto: CreateBookmarkTagDto) {
    return this.database.tx(async (trx) => {
      const tenantId = this.requireTenantId();
      // Verify the bookmark exists in the caller's tenant before tagging.
      const parent = await trx
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.id, dto.bookmark_id), eq(bookmarks.tenantId, tenantId)))
        .limit(1);
      if (parent.length === 0) {
        throw new NotFoundException(`BOOKMARK_NOT_FOUND:${dto.bookmark_id}`);
      }
      const now = new Date();
      await trx
        .insert(bookmarkTags)
        .values({
          bookmarkId: dto.bookmark_id,
          tag: dto.tag,
          createdAt: now,
        })
        .onConflictDoNothing();
      return { bookmarkId: dto.bookmark_id, tag: dto.tag, createdAt: now };
    });
  }

  async remove(bookmarkId: string, tag: string) {
    return this.database.tx(async (trx) => {
      const tenantId = this.requireTenantId();
      // Tenant gate via parent bookmark before delete.
      const parent = await trx
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.tenantId, tenantId)))
        .limit(1);
      if (parent.length === 0) {
        throw new NotFoundException(`BOOKMARK_NOT_FOUND:${bookmarkId}`);
      }
      const result = await trx
        .delete(bookmarkTags)
        .where(and(eq(bookmarkTags.bookmarkId, bookmarkId), eq(bookmarkTags.tag, tag)))
        .returning();
      if (result.length === 0) {
        throw new NotFoundException(`TAG_NOT_FOUND:${bookmarkId}/${tag}`);
      }
      return { status: 'deleted', bookmarkId, tag };
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new NotFoundException('TENANT_CONTEXT_MISSING');
    }
    return tenantId;
  }
}
