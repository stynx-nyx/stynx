import '@angular/compiler';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxLoadingSpinnerComponent,
  StynxPaginationComponent,
  StynxTableComponent,
} from '../../src';

describe('@stynx-web/angular-ui consumer E2E', () => {
  it('exposes shared UI components used by host apps', () => {
    expect(EmptyStateComponent).toBeDefined();
    expect(StynxBannerComponent).toBeDefined();
    expect(StynxLoadingSpinnerComponent).toBeDefined();
    expect(StynxPaginationComponent).toBeDefined();
    expect(StynxTableComponent).toBeDefined();
  });
});
