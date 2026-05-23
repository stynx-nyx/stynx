import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxToastService } from '@stynx-web/angular-ui';
import type { StynxSdkClient } from '@stynx-web/sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { provideStynxTrash } from '../src/provide-trash';
import { SdkTrashAdapter } from '../src/sdk-trash.adapter';
import { STYNX_TRASH_ADAPTER, STYNX_TRASH_CLIENT, STYNX_TRASH_OPTIONS } from '../src/tokens';
import { StynxTrashListComponent } from '../src/trash-list.component';
import type { StynxTrashAdapter, StynxTrashItem, StynxTrashQuery } from '../src/types';
import { renderComponent } from './support/test-bed';

interface MockSession {
  hasAllPermissions: (permissions: string[]) => boolean;
  snapshot: () => {
    sid: string | null;
    claims: Record<string, unknown> | null;
  };
}

interface SdkRequestOptions {
  query?: Record<string, unknown>;
}

function createSession(canHardDelete = true): MockSession {
  return {
    hasAllPermissions: () => canHardDelete,
    snapshot: () => ({
      sid: 'session-1',
      claims: { sub: 'user-1' },
    }),
  };
}

function createComponent(
  session: MockSession,
  toast: unknown,
  providedAdapter?: StynxTrashAdapter,
): StynxTrashListComponent {
  const injector = Injector.create({
    providers: [
      { provide: StynxSessionService, useValue: session },
      { provide: StynxToastService, useValue: toast },
      ...(providedAdapter ? [{ provide: STYNX_TRASH_ADAPTER, useValue: providedAdapter }] : []),
    ],
  });
  return runInInjectionContext(injector, () => new StynxTrashListComponent());
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe('@stynx-web/angular-trash', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders trash list rows, selection toolbar, and pagination through TestBed', async () => {
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'trash-1',
            label: 'Archived record',
            deletedAt: '2026-05-01T10:00:00.000Z',
            deletedBy: 'Ana',
            canHardDelete: true,
          },
        ],
        total: 1,
      })),
      restore: vi.fn(async () => undefined),
      hardDelete: vi.fn(async () => undefined),
    };
    const fixture = await renderComponent(StynxTrashListComponent, {
      inputs: { adapter },
      providers: [
        { provide: StynxSessionService, useValue: createSession(true) },
        { provide: StynxToastService, useValue: { push: vi.fn() } },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string, params?: Record<string, unknown>) => ({
              'trash.bulk.clear': 'Clear',
              'trash.bulk.hardDelete': 'Delete forever',
              'trash.bulk.restore': 'Restore selected',
              'trash.bulk.selected': `${params?.['count'] ?? 0} selected`,
              'trash.confirmHardDelete.confirm': 'Delete forever',
              'trash.confirmHardDelete.message': 'This cannot be undone.',
              'trash.confirmHardDelete.title': 'Delete archived item?',
              'trash.empty.description': 'Deleted items will appear here.',
              'trash.empty.title': 'Trash is empty',
              'trash.filters.ariaLabel': 'Filters',
              'trash.filters.byActor': 'By actor',
              'trash.filters.byMe': 'By me',
              'trash.filters.last7Days': 'Last 7 days',
              'trash.item.deletedBy': `Deleted by ${params?.['actor'] ?? ''}`,
              'trash.item.hardDelete': 'Delete forever',
              'trash.item.restore': 'Restore',
              'trash.item.select': 'Select',
              'trash.tabs.ariaLabel': 'Trash kinds',
              'ui.confirmDialog.cancel': 'Cancel',
              'ui.pagination.next': 'Next',
              'ui.pagination.pageStatus': `Page ${params?.['page'] ?? 1} of ${params?.['count'] ?? 1}`,
              'ui.pagination.previous': 'Previous',
            })[key] ?? key,
          },
        },
      ],
    });

    await fixture.componentInstance.load();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="trash-item-record-trash-1"]')?.textContent).toContain('Archived record');

    host.querySelector<HTMLInputElement>('[data-testid="trash-select-record-trash-1"]')?.click();
    fixture.detectChanges();
    expect(host.textContent).toContain('1 selected');
    expect(host.textContent).toContain('Page 1 of 1');
  });

  it('loads trash items and restores them through the adapter', async () => {
    const items = [
      {
        id: 'trash-1',
        label: 'Archived record',
        deletedAt: '2026-04-24T12:00:00.000Z',
        canHardDelete: true,
      },
    ];
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({
        items,
        total: items.length,
      })),
      restore: vi.fn(async () => {
        items.splice(0, 1);
      }),
      hardDelete: vi.fn(async () => undefined),
    };

    const component = createComponent(
      createSession(),
      {
        push: () => undefined,
      },
    );
    component.resource = 'records';
    component.adapter = adapter;

    expect(component.resolvedColumns).toEqual([
      { key: 'label', label: 'Item' },
      { key: 'deletedAt', label: 'Deleted at' },
    ]);

    await component.load();
    expect(component.items()).toHaveLength(1);

    await component.restore('trash-1');
    expect(adapter.restore).toHaveBeenCalledWith('records', 'trash-1');
    expect(component.items()).toHaveLength(0);
  });

  it('handles pagination, cascade restore, hard delete, and fallback errors', async () => {
    const items = [
      {
        id: 'trash-1',
        label: 'Archived record',
        deletedAt: '2026-04-24T12:00:00.000Z',
        canHardDelete: true,
      },
    ];
    const toastMessages: string[] = [];
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async (_resource: string, query: StynxTrashQuery) => ({
        items,
        total: query.pageSize,
      })),
      restore: vi.fn(async () => {
        throw { code: 'RESTORE_PARENT_ARCHIVED', message: 'needs cascade' };
      }),
      restoreWithCascade: vi.fn(async () => undefined),
      hardDelete: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      {
        push: (message: string) => toastMessages.push(message),
      },
    );
    component.resource = 'records';
    component.adapter = adapter;

    await component.setPage(2, 25);
    expect(adapter.list).toHaveBeenLastCalledWith('records', {
      pageIndex: 2,
      pageSize: 25,
      sort: 'deleted_at_desc',
    });
    expect(component.mayHardDelete(items[0] ?? { id: '', label: '', deletedAt: '' })).toBe(true);

    await component.restore('trash-1');
    expect(adapter.restoreWithCascade).toHaveBeenCalledWith('records', 'trash-1');
    expect(toastMessages).toContain('Restored with cascade');

    component.openConfirm('trash-1');
    await component.confirmHardDelete();
    expect(adapter.hardDelete).toHaveBeenCalledWith('records', 'trash-1');

    const noDelete = createComponent(
      createSession(false),
      { push: () => undefined },
    );
    noDelete.resource = 'records';
    noDelete.adapter = {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      restore: vi.fn(async () => {
        throw new Error('plain restore failure');
      }),
    };
    noDelete.openConfirm('missing');
    await noDelete.confirmHardDelete();
    await noDelete.restore('missing');
    expect(noDelete.errorMessage()).toBe('plain restore failure');
    expect(noDelete.mayHardDelete(items[0] ?? { id: '', label: '', deletedAt: '' })).toBe(false);

    noDelete.adapter = {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      restore: vi.fn(async () => {
        throw 'offline';
      }),
    };
    await noDelete.restore('missing');
    expect(noDelete.errorMessage()).toBe('Unable to update trash item.');
  });

  it('ships a default SDK adapter provider and multiplexes configured kinds', async () => {
    const client = {
      get: vi.fn(async (_path: string, options?: SdkRequestOptions) => {
        const kind = String(options?.query?.['kind']);
        return {
          data: [
            {
              id: `${kind}-1`,
              title: `${kind} item`,
              deleted_at: kind === 'record' ? '2026-05-18T00:00:00.000Z' : '2026-05-17T00:00:00.000Z',
              deleted_by: 'user-1',
              can_hard_delete: true,
              purge_at: '2026-05-25T00:00:00.000Z',
            },
          ],
          count: 1,
        };
      }),
      post: vi.fn(async () => undefined),
    } as unknown as StynxSdkClient;
    expect(provideStynxTrash(client)).toEqual(expect.anything());
    const injector = Injector.create({
      providers: [
        { provide: STYNX_TRASH_CLIENT, useValue: client },
        {
          provide: STYNX_TRASH_OPTIONS,
          useValue: {
            kinds: [
              { kind: 'record', label: 'Records' },
              { kind: 'document', label: 'Documents' },
            ],
          },
        },
        SdkTrashAdapter,
        {
          provide: STYNX_TRASH_ADAPTER,
          useExisting: SdkTrashAdapter,
        },
      ],
    });
    const adapter = injector.get(STYNX_TRASH_ADAPTER);

    const page = await adapter.list('all', { pageIndex: 0, pageSize: 10, sort: 'deleted_at_desc' });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.kind)).toEqual(['record', 'document']);
    expect(client.get).toHaveBeenCalledWith('/trash', {
      query: {
        kind: 'record',
        pageIndex: 0,
        pageSize: 10,
        sort: 'deleted_at_desc',
        deletedSince: undefined,
        deletedBy: undefined,
      },
    });

    await adapter.restore('document', 'doc-1');
    await adapter.restoreWithCascade?.('document', 'doc-2');
    await adapter.hardDelete?.('document', 'doc-3');
    await adapter.bulkRestore?.('document', ['doc-1', 'doc-2']);
    await adapter.bulkHardDelete?.('document', ['doc-3']);

    expect(client.post).toHaveBeenCalledWith('/trash/restore', { kind: 'document', id: 'doc-1' });
    expect(client.post).toHaveBeenCalledWith('/trash/restore', { kind: 'document', id: 'doc-2', cascade: true });
    expect(client.post).toHaveBeenCalledWith('/trash/hard-delete', { kind: 'document', id: 'doc-3' });
    expect(client.post).toHaveBeenCalledWith('/trash/bulk-restore', { kind: 'document', ids: ['doc-1', 'doc-2'] });
    expect(client.post).toHaveBeenCalledWith('/trash/bulk-hard-delete', { kind: 'document', ids: ['doc-3'] });
  });

  it('supports provider-backed components, tabs, filters, bulk actions, and retention countdowns', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-19T00:00:00.000Z'));
    const items: StynxTrashItem[] = [
      {
        id: 'trash-1',
        kind: 'record',
        label: 'Archived record',
        deletedAt: '2026-05-18T00:00:00.000Z',
        deletedBy: 'user-1',
        canHardDelete: true,
        autoPurgeAt: '2026-05-22T00:00:00.000Z',
      },
      {
        id: 'trash-2',
        kind: 'record',
        label: 'Archived note',
        deletedAt: '2026-05-17T00:00:00.000Z',
        deletedBy: 'actor-2',
        canHardDelete: true,
        autoPurgeAt: '2026-05-18T00:00:00.000Z',
      },
    ];
    const toastMessages: string[] = [];
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({ items, total: items.length })),
      restore: vi.fn(async () => undefined),
      hardDelete: vi.fn(async () => undefined),
      bulkRestore: vi.fn(async () => undefined),
      bulkHardDelete: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      { push: (message: string) => toastMessages.push(message) },
      adapter,
    );
    const firstItem = items[0];
    const secondItem = items[1];
    if (!firstItem || !secondItem) {
      throw new Error('Test fixture must include two trash items.');
    }

    await component.load();
    expect(component.retentionCountdown(firstItem)).toBe('Purges in 3 days');
    expect(component.retentionCountdown(secondItem)).toBe('Purge overdue yesterday');
    expect(component.retentionCountdown({ id: 'trash-3', label: 'No purge', deletedAt: '2026-05-18T00:00:00.000Z' }))
      .toBe('No purge scheduled');

    component.toggleSelected('trash-1');
    component.toggleSelected('trash-2');
    expect(component.selectedCount()).toBe(2);
    await component.bulkRestore();
    expect(adapter.bulkRestore).toHaveBeenCalledWith('record', ['trash-1', 'trash-2']);
    expect(toastMessages).toContain('Restored selected items');

    component.toggleSelected('trash-1');
    await component.bulkHardDelete();
    expect(adapter.bulkHardDelete).toHaveBeenCalledWith('record', ['trash-1']);
    expect(toastMessages).toContain('Selected items removed permanently');

    await component.selectKind('document');
    expect(component.activeKind()).toBe('document');
    expect(adapter.list).toHaveBeenLastCalledWith('document', {
      pageIndex: 0,
      pageSize: 10,
      sort: 'deleted_at_desc',
    });

    component.filterByActor = 'actor-2';
    await component.toggleFilter('by_actor');
    expect(adapter.list).toHaveBeenLastCalledWith('document', {
      pageIndex: 0,
      pageSize: 10,
      sort: 'deleted_at_desc',
      deletedBy: 'actor-2',
    });

    await component.toggleFilter('last_7_days');
    expect(adapter.list).toHaveBeenLastCalledWith('document', {
      pageIndex: 0,
      pageSize: 10,
      sort: 'deleted_at_desc',
      deletedSince: '2026-05-12T00:00:00.000Z',
      deletedBy: 'actor-2',
    });
  });

  it('falls back to per-item bulk operations and filters by the current session', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-19T00:00:00.000Z'));
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({
        items: [
          { id: 'trash-1', label: 'One', deletedAt: '2026-05-18T00:00:00.000Z', canHardDelete: true },
          { id: 'trash-2', label: 'Two', deletedAt: '2026-05-17T00:00:00.000Z', canHardDelete: true },
        ],
        total: 2,
      })),
      restore: vi.fn(async () => undefined),
      hardDelete: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      { push: vi.fn() },
      adapter,
    );

    await component.load();
    component.toggleSelected('trash-1');
    component.toggleSelected('trash-2');
    await component.bulkRestore();
    expect(adapter.restore).toHaveBeenCalledWith('record', 'trash-1');
    expect(adapter.restore).toHaveBeenCalledWith('record', 'trash-2');

    component.toggleSelected('trash-1');
    await component.bulkHardDelete();
    expect(adapter.hardDelete).toHaveBeenCalledWith('record', 'trash-1');

    await component.toggleFilter('by_me');
    expect(adapter.list).toHaveBeenLastCalledWith('record', {
      pageIndex: 0,
      pageSize: 10,
      sort: 'deleted_at_desc',
      deletedBy: 'user-1',
    });
  });

  it('prunes stale selections, clears load errors, and preserves row fields', async () => {
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({
        items: [
          {
            id: 'kept',
            label: 'Kept row',
            deletedAt: '2026-05-18T00:00:00.000Z',
            deletedBy: 'user-1',
            canHardDelete: true,
          },
        ],
        total: 1,
      })),
      restore: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      { push: vi.fn() },
      adapter,
    );
    component.errorMessage.set('previous failure');
    component.toggleSelected('kept');
    component.toggleSelected('stale');

    await component.load();

    expect(component.errorMessage()).toBe('');
    expect([...component.selectedIds()]).toEqual(['kept']);
    expect(component.rows()).toEqual([
      {
        label: 'Kept row',
        deletedAt: '2026-05-18T00:00:00.000Z',
        deletedBy: 'user-1',
        retention: 'No purge scheduled',
      },
    ]);
  });

  it('preserves default inputs and no-op bulk hard-delete guards exactly', async () => {
    const toast = { push: vi.fn() };
    const list = vi.fn(async () => ({
      items: [
        {
          id: 'kept',
          label: 'Kept row',
          deletedAt: '2026-05-18T00:00:00.000Z',
          canHardDelete: true,
        },
      ],
      total: 1,
    }));
    const hardDelete = vi.fn(async () => undefined);
    const component = createComponent(
      {
        hasAllPermissions: (permissions: string[]) => permissions.includes('archive:hard-delete:*'),
        snapshot: () => ({ sid: 'session-1', claims: null }),
      },
      toast,
      {
        list,
        restore: vi.fn(async () => undefined),
        hardDelete,
      },
    );
    component.kinds = [{ kind: 'document', label: 'Documents' }];

    expect(component.resource).toBe('record');
    expect(component.activeKind()).toBe('record');
    expect(component.hardDeletePermission).toBe('archive:hard-delete:*');
    expect(component.errorMessage()).toBe('');
    expect(component.mayHardDelete({
      id: 'trash-1',
      label: 'One',
      deletedAt: '2026-05-18T00:00:00.000Z',
      canHardDelete: true,
    })).toBe(true);

    await component.load();
    expect(component.rows()).toEqual([
      {
        label: 'Kept row',
        deletedAt: '2026-05-18T00:00:00.000Z',
        deletedBy: '',
        retention: 'No purge scheduled',
      },
    ]);

    await component.bulkHardDelete();
    expect(hardDelete).not.toHaveBeenCalled();
    expect(toast.push).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);

    component.toggleSelected('kept');
    component.adapter = {
      list,
      restore: vi.fn(async () => undefined),
    };
    await component.bulkHardDelete();
    expect(toast.push).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('honors default kind, selection/filter toggles, empty bulk guards, and missing adapters', async () => {
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      restore: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      { push: vi.fn() },
      adapter,
    );
    component.resource = '' as never;
    component.kinds = [];

    expect(component.activeKind()).toBe('record');
    component.toggleSelected('one');
    component.toggleSelected('one');
    expect(component.selectedCount()).toBe(0);

    await component.toggleFilter('last_7_days');
    await component.toggleFilter('last_7_days');
    expect(component.isFilterActive('last_7_days')).toBe(false);

    await component.bulkRestore();
    await component.bulkHardDelete();
    expect(adapter.restore).not.toHaveBeenCalledTimes(1);

    const missingAdapter = createComponent(createSession(), { push: vi.fn() });
    expect(() => missingAdapter.activeKind()).not.toThrow();
    await expect(missingAdapter.load()).rejects.toThrow('StynxTrashListComponent requires an adapter input or provideStynxTrash(...).');
  });

  it('checks hard-delete permission names, invalid purge dates, and today countdowns', () => {
    const requestedPermissions: string[][] = [];
    const component = createComponent(
      {
        hasAllPermissions: (permissions: string[]) => {
          requestedPermissions.push(permissions);
          return permissions.includes('trash:purge');
        },
        snapshot: () => ({ sid: 'session-1', claims: null }),
      },
      { push: vi.fn() },
      {
        list: vi.fn(async () => ({ items: [], total: 0 })),
        restore: vi.fn(async () => undefined),
      },
    );
    component.hardDeletePermission = 'trash:purge';
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-19T00:00:00.000Z'));

    expect(component.mayHardDelete({
      id: 'trash-1',
      label: 'One',
      deletedAt: '2026-05-18T00:00:00.000Z',
      canHardDelete: true,
    })).toBe(true);
    expect(requestedPermissions).toEqual([['trash:purge']]);
    expect(component.retentionCountdown({
      id: 'invalid',
      label: 'Invalid',
      deletedAt: '2026-05-18T00:00:00.000Z',
      autoPurgeAt: 'not-a-date',
    })).toBe('No purge scheduled');
    expect(component.retentionCountdown({
      id: 'today',
      label: 'Today',
      deletedAt: '2026-05-18T00:00:00.000Z',
      autoPurgeAt: '2026-05-19T00:00:00.000Z',
    })).toBe('Purges today');
  });

  it('does not cascade unrelated restore errors and preserves exact toast messages', async () => {
    const toastMessages: Array<[string, string]> = [];
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      restore: vi.fn(async () => {
        throw { code: 'NOT_ALLOWED', message: 'restore denied' };
      }),
      restoreWithCascade: vi.fn(async () => undefined),
      hardDelete: vi.fn(async () => undefined),
    };
    const component = createComponent(
      createSession(),
      { push: (message: string, tone: string) => toastMessages.push([message, tone]) },
      adapter,
    );

    await component.restore('trash-1');
    expect(adapter.restoreWithCascade).not.toHaveBeenCalledTimes(1);
    expect(component.errorMessage()).toBe('restore denied');

    adapter.restore = vi.fn(async () => undefined);
    await component.restore('trash-1');
    expect(toastMessages).toContainEqual(['Restored from trash', 'success']);

    component.openConfirm('trash-1');
    await component.confirmHardDelete();
    expect(toastMessages).toContainEqual(['Archived row removed permanently', 'warning']);
  });
});
