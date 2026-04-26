import '@angular/compiler';
import { StynxPaginationComponent } from '../src/pagination.component';
import { StynxToastService } from '../src/toast.service';

describe('@stynx-web/angular-ui', () => {
  it('tracks toast lifecycle through the toast service', () => {
    const service = new StynxToastService();
    const toast = service.push('Saved', 'success');
    expect(service.toasts()).toEqual([toast]);
    service.dismiss(toast.id);
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
});
