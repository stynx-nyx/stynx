import { Injectable, inject } from '@angular/core';
import { STYNX_TRASH_CLIENT, STYNX_TRASH_OPTIONS } from './tokens';
import type {
  StynxTrashAdapter,
  StynxTrashItem,
  StynxTrashKind,
  StynxTrashPage,
  StynxTrashQuery,
} from './types';

type QueryValue = string | number | boolean | null | undefined;
type QueryRecord = Record<string, QueryValue>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function queryFor(kind: StynxTrashKind, query: StynxTrashQuery): QueryRecord {
  return {
    kind,
    pageIndex: query.pageIndex,
    pageSize: query.pageSize,
    sort: query.sort,
    deletedSince: query.deletedSince,
    deletedBy: query.deletedBy,
  };
}

@Injectable()
export class SdkTrashAdapter implements StynxTrashAdapter {
  private readonly client = inject(STYNX_TRASH_CLIENT);
  private readonly options = inject(STYNX_TRASH_OPTIONS);

  async list(resource: string, query: StynxTrashQuery): Promise<StynxTrashPage> {
    const kinds = this.resolveKinds(resource);
    const pages = await Promise.all(
      kinds.map((kind) => this.client.get<unknown>('/trash', { query: queryFor(kind, query) })),
    );

    const items: StynxTrashItem[] = [];
    pages.forEach((page, index) => {
      items.push(...this.normalizePage(page, kinds[index] ?? resource).items);
    });
    items.sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));

    if (kinds.length === 1) {
      return {
        items,
        total: this.normalizePage(pages[0], kinds[0] ?? resource).total,
      };
    }

    const start = query.pageIndex * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize),
      total: pages.reduce<number>(
        (total, page, index) => total + this.normalizePage(page, kinds[index] ?? resource).total,
        0,
      ),
    };
  }

  restore(resource: string, id: string): Promise<void> {
    return this.client.post<void>('/trash/restore', { kind: resource, id });
  }

  restoreWithCascade(resource: string, id: string): Promise<void> {
    return this.client.post<void>('/trash/restore', { kind: resource, id, cascade: true });
  }

  hardDelete(resource: string, id: string): Promise<void> {
    return this.client.post<void>('/trash/hard-delete', { kind: resource, id });
  }

  bulkRestore(resource: string, ids: string[]): Promise<void> {
    return this.client.post<void>('/trash/bulk-restore', { kind: resource, ids });
  }

  bulkHardDelete(resource: string, ids: string[]): Promise<void> {
    return this.client.post<void>('/trash/bulk-hard-delete', { kind: resource, ids });
  }

  private resolveKinds(resource: string): StynxTrashKind[] {
    if (resource && resource !== 'all' && resource !== '*') {
      return [resource];
    }

    return this.options.kinds.map((kind) => kind.kind);
  }

  private normalizePage(input: unknown, fallbackKind: StynxTrashKind): StynxTrashPage {
    const record = asRecord(input);
    const rawItems = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.data)
        ? record.data
        : [];
    const items = rawItems.map((item) => this.normalizeItem(item, fallbackKind));
    return {
      items,
      total: numberValue(record.total) ?? numberValue(record.count) ?? items.length,
    };
  }

  private normalizeItem(input: unknown, fallbackKind: StynxTrashKind): StynxTrashItem {
    const record = asRecord(input);
    const id = stringValue(record.id) ?? stringValue(record.trashId) ?? '';
    const canHardDelete = booleanValue(record.canHardDelete) ?? booleanValue(record.can_hard_delete);
    const item: StynxTrashItem = {
      id,
      kind: (stringValue(record.kind) ?? fallbackKind) as StynxTrashKind,
      label: stringValue(record.label) ?? stringValue(record.title) ?? stringValue(record.name) ?? id,
      deletedAt: stringValue(record.deletedAt) ?? stringValue(record.deleted_at) ?? '',
      deletedBy: stringValue(record.deletedBy) ?? stringValue(record.deleted_by) ?? null,
      autoPurgeAt: stringValue(record.autoPurgeAt)
        ?? stringValue(record.auto_purge_at)
        ?? stringValue(record.purgeAt)
        ?? stringValue(record.retentionUntil)
        ?? null,
    };
    if (canHardDelete !== undefined) {
      item.canHardDelete = canHardDelete;
    }
    return item;
  }
}
