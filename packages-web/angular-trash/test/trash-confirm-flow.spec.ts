import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StynxTrashListComponent } from '../src/trash-list.component';
import type { StynxTrashAdapter } from '../src/types';
import { renderComponent } from './support/test-bed';

const i18n = {
  locale: () => 'en-US',
  translate: (key: string, params: Record<string, unknown> = {}) => ({
    'trash.confirmHardDelete.confirm': 'Delete forever',
    'trash.confirmHardDelete.message': 'This cannot be undone.',
    'trash.confirmHardDelete.title': 'Delete archived item?',
    'trash.empty.description': 'Deleted items will appear here.',
    'trash.empty.title': 'Trash is empty',
    'trash.filters.ariaLabel': 'Filters',
    'trash.filters.byActor': 'By actor',
    'trash.filters.byMe': 'By me',
    'trash.filters.last7Days': 'Last 7 days',
    'trash.item.deletedBy': `Deleted by ${params['actor'] ?? ''}`,
    'trash.item.hardDelete': 'Delete forever',
    'trash.item.restore': 'Restore',
    'trash.item.select': 'Select',
    'trash.tabs.ariaLabel': 'Trash kinds',
    'ui.confirmDialog.cancel': 'Cancel',
    'ui.pagination.next': 'Next',
    'ui.pagination.pageStatus': `Page ${params['page'] ?? 1} of ${params['count'] ?? 1}`,
    'ui.pagination.previous': 'Previous',
  })[key] ?? key,
};

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular-trash confirm flow depth', () => {
  it('renders soft-deleted rows and gates hard delete behind confirmation', async () => {
    const adapter: StynxTrashAdapter = {
      hardDelete: vi.fn(async () => undefined),
      list: vi.fn(async () => ({
        items: [{
          canHardDelete: true,
          deletedAt: '2026-06-01T12:00:00.000Z',
          deletedBy: 'user-1',
          id: 'trash-1',
          label: 'Archived case',
        }],
        total: 1,
      })),
      restore: vi.fn(async () => undefined),
    };
    const toast = { push: vi.fn() };
    const fixture = await renderComponent(StynxTrashListComponent, {
      inputs: { adapter },
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            hasAllPermissions: vi.fn((permissions: string[]) => permissions.includes('archive:hard-delete:*')),
            snapshot: vi.fn(() => ({ claims: { sub: 'user-1' }, sid: 'sid-1' })),
          },
        },
        { provide: StynxToastService, useValue: toast },
        { provide: StynxI18nService, useValue: i18n },
      ],
    });

    await fixture.componentInstance.load();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="trash-item-record-trash-1"]')?.textContent).toContain('Archived case');

    host.querySelector<HTMLButtonElement>('[data-testid="trash-hard-delete-record-trash-1"]')?.click();
    fixture.detectChanges();
    expect(adapter.hardDelete).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Delete archived item?');

    await fixture.componentInstance.confirmHardDelete();
    fixture.detectChanges();
    expect(adapter.hardDelete).toHaveBeenCalledWith('record', 'trash-1');
    expect(toast.push).toHaveBeenCalledWith('Archived row removed permanently', 'warning');
  });

  it('calls restore with the row id and refreshes visible rows', async () => {
    const items = [{
      canHardDelete: false,
      deletedAt: '2026-06-01T12:00:00.000Z',
      id: 'trash-1',
      label: 'Archived case',
    }];
    const adapter: StynxTrashAdapter = {
      list: vi.fn(async () => ({ items, total: items.length })),
      restore: vi.fn(async (_kind, id) => {
        expect(id).toBe('trash-1');
        items.splice(0, 1);
      }),
    };
    const fixture = await renderComponent(StynxTrashListComponent, {
      inputs: { adapter },
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            hasAllPermissions: vi.fn(() => false),
            snapshot: vi.fn(() => ({ claims: { sub: 'user-1' }, sid: 'sid-1' })),
          },
        },
        { provide: StynxToastService, useValue: { push: vi.fn() } },
        { provide: StynxI18nService, useValue: i18n },
      ],
    });

    await fixture.componentInstance.load();
    await fixture.componentInstance.restore('trash-1');
    fixture.detectChanges();

    expect(adapter.restore).toHaveBeenCalledWith('record', 'trash-1');
    expect(fixture.componentInstance.items()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Trash is empty');
  });
});
