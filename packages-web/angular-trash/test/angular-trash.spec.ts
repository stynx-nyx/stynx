import '@angular/compiler';
import { jest } from '@jest/globals';
import { StynxTrashListComponent } from '../src/trash-list.component';
import type { StynxTrashAdapter } from '../src/types';

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
});
