import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxBannerComponent } from '../src/banner.component';
import { StynxConfirmDialogComponent } from '../src/confirm-dialog.component';
import { STYNX_ICON_NAMES, StynxIconComponent } from '../src/icon/icon.component';
import { StynxLoadingSpinnerComponent } from '../src/loading-spinner.component';
import { StynxPaginationComponent } from '../src/pagination.component';
import { StynxTableComponent } from '../src/table.component';
import { StynxToastContainerComponent } from '../src/toast-container.component';
import { StynxToastService } from '../src/toast.service';
import { renderComponent } from './support/test-bed';

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

  it('renders UI primitives through TestBed with DOM output and click emitters', async () => {
    const i18n = {
      locale: () => 'en',
      translate: (key: string, params?: Record<string, unknown>) => ({
        'ui.confirmDialog.cancel': 'Cancel',
        'ui.pagination.next': 'Next',
        'ui.pagination.pageStatus': `Page ${params?.['page'] ?? 1} of ${params?.['count'] ?? 1}`,
        'ui.pagination.previous': 'Previous',
      })[key] ?? key,
    };

    const banner = await renderComponent(StynxBannerComponent, {
      inputs: { title: 'Heads up', message: 'Policy changed', tone: 'warning' },
    });
    expect((banner.nativeElement as HTMLElement).textContent).toContain('Heads up');
    expect((banner.nativeElement as HTMLElement).querySelector('section')?.getAttribute('data-tone')).toBe('warning');

    const confirmSeen: string[] = [];
    const confirm = await renderComponent(StynxConfirmDialogComponent, {
      inputs: { open: true, title: 'Delete', message: 'Delete item?', confirmLabel: 'Delete' },
      providers: [{ provide: StynxI18nService, useValue: i18n }],
    });
    confirm.componentInstance.confirm.subscribe(() => confirmSeen.push('confirm'));
    confirm.componentInstance.dismissed.subscribe(() => confirmSeen.push('dismiss'));
    const confirmButtons = (confirm.nativeElement as HTMLElement).querySelectorAll('button');
    confirmButtons[0]?.click();
    confirmButtons[1]?.click();
    expect(confirmSeen).toEqual(['dismiss', 'confirm']);

    const paginationSeen: Array<{ pageIndex: number; pageSize: number }> = [];
    const pagination = await renderComponent(StynxPaginationComponent, {
      inputs: { totalItems: 25, page: 0, pageSizeInput: 10 },
      providers: [{ provide: StynxI18nService, useValue: i18n }],
    });
    pagination.componentInstance.pageChange.subscribe((event) => paginationSeen.push(event));
    (pagination.nativeElement as HTMLElement).querySelectorAll('button')[1]?.click();
    expect(paginationSeen).toEqual([{ pageIndex: 1, pageSize: 10 }]);

    const table = await renderComponent(StynxTableComponent<{ name: string }>, {
      inputs: {
        columns: [{ key: 'name', label: 'Name' }],
        rows: [{ name: 'Ada' }],
      },
    });
    expect((table.nativeElement as HTMLElement).textContent).toContain('Ada');

    const spinner = await renderComponent(StynxLoadingSpinnerComponent, {
      inputs: { label: 'Loading records', size: 2 },
    });
    expect((spinner.nativeElement as HTMLElement).textContent).toContain('Loading records');

    const icon = await renderComponent(StynxIconComponent, {
      inputs: { name: 'check', label: 'Done' },
    });
    expect((icon.nativeElement as HTMLElement).querySelector('svg')?.getAttribute('aria-label')).toBe('Done');
  });

  it('renders the toast container and dismisses toasts from the DOM', async () => {
    const fixture = await renderComponent(StynxToastContainerComponent, {
      providers: [StynxToastService],
    });
    const service = TestBed.inject(StynxToastService);
    service.push('Saved', 'success', 0);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Saved');
    host.querySelector('button')?.click();
    fixture.detectChanges();
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
