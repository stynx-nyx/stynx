import '@angular/compiler';
import { jest } from '@jest/globals';
import { StynxTrashListComponent } from '../src/trash-list.component';
import type { StynxTrashAdapter, StynxTrashQuery } from '../src/types';

describe('@stynx-web/angular-trash', () => {
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
      list: jest.fn(async () => ({
        items,
        total: items.length,
      })),
      restore: jest.fn(async () => {
        items.splice(0, 1);
      }),
      hardDelete: jest.fn(async () => undefined),
    };

    const component = new StynxTrashListComponent(
      {
        hasAllPermissions: () => true,
      } as never,
      {
        push: () => undefined,
      } as never,
    );
    component.resource = 'records';
    component.adapter = adapter;

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
      list: jest.fn(async (_resource: string, query: StynxTrashQuery) => ({
        items,
        total: query.pageSize,
      })),
      restore: jest.fn(async () => {
        throw { code: 'RESTORE_PARENT_ARCHIVED', message: 'needs cascade' };
      }),
      restoreWithCascade: jest.fn(async () => undefined),
      hardDelete: jest.fn(async () => undefined),
    };
    const component = new StynxTrashListComponent(
      {
        hasAllPermissions: () => true,
      } as never,
      {
        push: (message: string) => toastMessages.push(message),
      } as never,
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

    const noDelete = new StynxTrashListComponent(
      { hasAllPermissions: () => false } as never,
      { push: () => undefined } as never,
    );
    noDelete.resource = 'records';
    noDelete.adapter = {
      list: jest.fn(async () => ({ items: [], total: 0 })),
      restore: jest.fn(async () => {
        throw new Error('plain restore failure');
      }),
    };
    noDelete.openConfirm('missing');
    await noDelete.confirmHardDelete();
    await noDelete.restore('missing');
    expect(noDelete.errorMessage()).toBe('plain restore failure');
    expect(noDelete.mayHardDelete(items[0] ?? { id: '', label: '', deletedAt: '' })).toBe(false);
  });
});
