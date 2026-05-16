// C-4 Session T2 — BookmarkService wired to @stynx/data
//
// Replaces the S3-2 NotImplementedException stubs. Follows the stynx
// pattern from reference/api/src/sample/reference-sample.service.ts:
// constructor injection of Database + RequestContext, tenant-scoped
// transactions, role + readonly hints.

import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { and, desc, eq } from 'drizzle-orm';
import { bookmarks } from '../schema';
import type { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import type { UpdateBookmarkDto } from '../dto/update-bookmark.dto';

function clampLimit(value?: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Number(value), 1), 200);
}

@Injectable()
export class BookmarkService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
  ) {}

  async findAll(limit?: number) {
    return this.database.tx(
      async (trx) =>
        trx
          .select()
          .from(bookmarks)
          .where(eq(bookmarks.tenantId, this.requireTenantId()))
          .orderBy(desc(bookmarks.createdAt))
          .limit(clampLimit(limit)),
      { role: 'reader', readonly: true },
    );
  }

  async findOne(id: string) {
    const rows = await this.database.tx(
      async (trx) =>
        trx
          .select()
          .from(bookmarks)
          .where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, this.requireTenantId())))
          .limit(1),
      { role: 'reader', readonly: true },
    );
    if (rows.length === 0) {
      throw new NotFoundException(`BOOKMARK_NOT_FOUND:${id}`);
    }
    return rows[0];
  }

  async create(dto: CreateBookmarkDto) {
    return this.database.tx(async (trx) => {
      const id = randomUUID();
      const now = new Date();
      await trx.insert(bookmarks).values({
        id,
        tenantId: this.requireTenantId(),
        ownerId: this.requireOwnerId(),
        url: dto.url,
        title: dto.title ?? null,
        notes: dto.notes ?? null,
        createdAt: now,
        updatedAt: now,
      });
      const created = await trx
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.id, id))
        .limit(1);
      return created[0];
    });
  }

  async update(id: string, dto: UpdateBookmarkDto) {
    return this.database.tx(async (trx) => {
      const tenantId = this.requireTenantId();
      const result = await trx
        .update(bookmarks)
        .set({
          ...(dto.url !== undefined && { url: dto.url }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          updatedAt: new Date(),
        })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, tenantId)))
        .returning();
      if (result.length === 0) {
        throw new NotFoundException(`BOOKMARK_NOT_FOUND:${id}`);
      }
      return result[0];
    });
  }

  async remove(id: string) {
    return this.database.tx(async (trx) => {
      const tenantId = this.requireTenantId();
      const result = await trx
        .delete(bookmarks)
        .where(and(eq(bookmarks.id, id), eq(bookmarks.tenantId, tenantId)))
        .returning({ id: bookmarks.id });
      if (result.length === 0) {
        throw new NotFoundException(`BOOKMARK_NOT_FOUND:${id}`);
      }
      return { status: 'soft-deleted', id };
    });
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new NotFoundException('TENANT_CONTEXT_MISSING');
    }
    return tenantId;
  }

  private requireOwnerId(): string {
    const actorId = this.requestContext.actorId;
    if (!actorId) {
      throw new NotFoundException('ACTOR_CONTEXT_MISSING');
    }
    return actorId;
  }
}
