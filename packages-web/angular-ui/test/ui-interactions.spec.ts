import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StynxConfirmDialogComponent } from '../src/confirm-dialog.component';
import { StynxPaginationComponent } from '../src/pagination.component';
import { StynxTableComponent } from '../src/table.component';
import { StynxToastService } from '../src/toast.service';
import { renderComponent } from './support/test-bed';

const i18n = {
  locale: () => 'en-US',
  translate: (key: string, params: Record<string, unknown> = {}) => ({
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

describe('@stynx-web/angular-ui interaction depth', () => {
  it('renders confirm dialog only when open and emits dismiss/confirm from buttons', async () => {
    const fixture = await renderComponent(StynxConfirmDialogComponent, {
      inputs: { confirmLabel: 'Delete', message: 'Delete archived row?', open: false, title: 'Delete row' },
      providers: [{ provide: StynxI18nService, useValue: i18n }],
    });
    const seen: string[] = [];
    fixture.componentInstance.dismissed.subscribe(() => seen.push('dismiss'));
    fixture.componentInstance.confirm.subscribe(() => seen.push('confirm'));

    expect((fixture.nativeElement as HTMLElement).querySelector('.stynx-confirm-dialog')).toBe(null);

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Delete archived row?');
    buttons[0]?.click();
    buttons[1]?.click();

    expect(seen).toEqual(['dismiss', 'confirm']);
  });

  it('renders table cells and keeps pagination boundary buttons disabled accurately', async () => {
    const table = await renderComponent(StynxTableComponent<{ id: string; owner: string }>, {
      inputs: {
        columns: [
          { key: 'id', label: 'ID' },
          { key: 'owner', label: 'Owner' },
        ],
        rows: [{ id: 'row-1', owner: 'Ada' }],
      },
    });
    const tableHost = table.nativeElement as HTMLElement;
    expect(Array.from(tableHost.querySelectorAll('th')).map((cell) => cell.textContent?.trim())).toEqual([
      'ID',
      'Owner',
    ]);
    expect(Array.from(tableHost.querySelectorAll('td')).map((cell) => cell.textContent?.trim())).toEqual([
      'row-1',
      'Ada',
    ]);

    const pagination = await renderComponent(StynxPaginationComponent, {
      inputs: { page: 0, pageSizeInput: 10, totalItems: 11 },
      providers: [{ provide: StynxI18nService, useValue: i18n }],
    });
    const seen: Array<{ pageIndex: number; pageSize: number }> = [];
    pagination.componentInstance.pageChange.subscribe((event) => seen.push(event));
    const buttons = (pagination.nativeElement as HTMLElement).querySelectorAll('button');
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(false);
    buttons[1]?.click();
    pagination.detectChanges();

    expect(seen).toEqual([{ pageIndex: 1, pageSize: 10 }]);
    expect((pagination.nativeElement as HTMLElement).textContent).toContain('Page 2 of 2');
  });

  it('expires only timed toasts while sticky toasts remain dismissible', () => {
    vi.useFakeTimers();
    try {
      const service = TestBed.runInInjectionContext(() => new StynxToastService());
      const sticky = service.push('Pinned', 'warning', 0);
      const timed = service.push('Saved', 'success', 50);

      expect(service.toasts()).toEqual([sticky, timed]);
      vi.advanceTimersByTime(49);
      expect(service.toasts()).toEqual([sticky, timed]);
      vi.advanceTimersByTime(1);
      expect(service.toasts()).toEqual([sticky]);
      service.dismiss(sticky.id);
      expect(service.toasts()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
