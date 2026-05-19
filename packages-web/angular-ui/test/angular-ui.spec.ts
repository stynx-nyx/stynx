import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxBannerComponent } from '../src/banner.component';
import { StynxConfirmDialogComponent } from '../src/confirm-dialog.component';
import { STYNX_ICON_NAMES, StynxIconComponent } from '../src/icon/icon.component';
import { StynxLoadingSpinnerComponent } from '../src/loading-spinner.component';
import { StynxPaginationComponent } from '../src/pagination.component';
import { StynxTableComponent } from '../src/table.component';
import { StynxToastContainerComponent } from '../src/toast-container.component';
import { StynxToastService } from '../src/toast.service';

function createToastService(): StynxToastService {
  return TestBed.runInInjectionContext(() => new StynxToastService());
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-ui', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks toast lifecycle through the toast service', () => {
    const service = createToastService();
    const toast = service.push('Saved', 'success');
    expect(service.toasts()).toEqual([toast]);
    service.dismiss(toast.id);
    expect(service.toasts()).toEqual([]);
  });

  it('supports sticky, timed, and clear toast lifecycle paths', () => {
    vi.useFakeTimers();
    const service = createToastService();
    const sticky = service.push('Pinned', 'warning', 0);
    const timed = service.push('Saved', undefined, 25);

    expect(service.toasts()).toEqual([
      sticky,
      { id: timed.id, message: 'Saved', tone: 'info' },
    ]);

    vi.advanceTimersByTime(25);
    expect(service.toasts()).toEqual([sticky]);

    service.clear();
    expect(service.toasts()).toEqual([]);
  });

  it('clamps pagination changes and emits page-change events', () => {
    const component = new StynxPaginationComponent();
    const seen: Array<{ pageIndex: number; pageSize: number }> = [];
    component.pageSizeInput = 10;
    component.totalItems = 42;
    component.pageChange.subscribe((event) => seen.push(event));

    component.next();
    component.next();
    component.previous();

    expect(component.pageIndex()).toBe(1);
    expect(component.pageCount()).toBe(5);
    expect(seen).toEqual([
      { pageIndex: 1, pageSize: 10 },
      { pageIndex: 2, pageSize: 10 },
      { pageIndex: 1, pageSize: 10 },
    ]);
  });

  it('normalizes pagination inputs and clamps navigation at both ends', () => {
    const component = new StynxPaginationComponent();
    const seen: Array<{ pageIndex: number; pageSize: number }> = [];
    component.pageChange.subscribe((event) => seen.push(event));

    component.pageSizeInput = 0;
    component.totalItems = -12;
    component.page = -3;
    component.previous();
    expect(component.pageSize()).toBe(1);
    expect(component.total()).toBe(0);
    expect(component.pageIndex()).toBe(0);

    component.totalItems = 2;
    component.page = 10;
    component.next();
    expect(component.pageIndex()).toBe(1);
    expect(component.pageCount()).toBe(2);
    expect(seen).toEqual([
      { pageIndex: 0, pageSize: 1 },
      { pageIndex: 1, pageSize: 1 },
    ]);
  });

  it('keeps simple component inputs and emitters wired', () => {
    const banner = new StynxBannerComponent();
    expect(banner).toMatchObject({ title: '', message: '', tone: 'info' });
    expect(banner.toneIcon).toBe('info');
    banner.title = 'Heads up';
    banner.message = 'Policy changed';
    banner.tone = 'warning';
    expect(banner).toMatchObject({ title: 'Heads up', message: 'Policy changed', tone: 'warning' });
    expect(banner.toneIcon).toBe('warning');

    const confirm = new StynxConfirmDialogComponent();
    const seen: string[] = [];
    confirm.confirm.subscribe(() => seen.push('confirm'));
    confirm.dismissed.subscribe(() => seen.push('cancel'));
    confirm.open = true;
    confirm.title = 'Delete';
    confirm.message = 'Delete this item?';
    confirm.confirmLabel = 'Delete';
    confirm.confirm.emit();
    confirm.dismissed.emit();
    expect(seen).toEqual(['confirm', 'cancel']);

    const spinner = new StynxLoadingSpinnerComponent();
    expect(spinner).toMatchObject({ size: 1.4, label: '' });
    spinner.size = 2;
    spinner.label = 'Loading';
    expect(spinner).toMatchObject({ size: 2, label: 'Loading' });
  });

  it('exposes the shared icon sprite names and href contract', () => {
    expect(STYNX_ICON_NAMES).toContain('arrow-right');
    expect(STYNX_ICON_NAMES).toContain('plus');

    const icon = new StynxIconComponent();
    expect(icon.href).toBe('#info');
    icon.name = 'arrow-right';
    icon.label = 'Next';
    expect(icon.href).toBe('#arrow-right');
    expect(icon.label).toBe('Next');
  });

  it('tracks table rows with custom or JSON identity', () => {
    const component = new StynxTableComponent<{ id: number; name: string }>();
    component.columns = [{ key: 'name', label: 'Name' }];
    component.rows = [{ id: 7, name: 'Ada' }];
    expect((component as unknown as { trackBy: (row: { id: number; name: string }) => string | number }).trackBy(component.rows[0]!))
      .toBe('{"id":7,"name":"Ada"}');

    component.rowTrackBy = (row) => row.id;
    expect((component as unknown as { trackBy: (row: { id: number; name: string }) => string | number }).trackBy(component.rows[0]!))
      .toBe(7);
  });

  it('declares the toast container service dependency', () => {
    expect(StynxToastContainerComponent).toBeDefined();
  });
});
