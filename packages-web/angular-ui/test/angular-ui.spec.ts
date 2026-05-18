import '@angular/compiler';
import { StynxPaginationComponent } from '../src/pagination.component';
import { StynxToastService } from '../src/toast.service';

describe('@stynx-web/angular-ui', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks toast lifecycle through the toast service', () => {
    const service = new StynxToastService();
    const toast = service.push('Saved', 'success');
    expect(service.toasts()).toEqual([toast]);
    service.dismiss(toast.id);
    expect(service.toasts()).toEqual([]);
  });

  it('supports sticky, timed, and clear toast lifecycle paths', () => {
    vi.useFakeTimers();
    const service = new StynxToastService();
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
});
