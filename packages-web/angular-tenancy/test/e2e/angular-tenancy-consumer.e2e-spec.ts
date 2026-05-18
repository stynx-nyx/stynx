import '@angular/compiler';
import { TenantContextService, TenantSwitcherComponent, provideTenancy } from '../../src';

describe('@stynx-web/angular-tenancy consumer E2E', () => {
  it('exposes tenant context providers and switcher UI', () => {
    expect(TenantContextService).toBeDefined();
    expect(TenantSwitcherComponent).toBeDefined();
    expect(provideTenancy()).toEqual(expect.any(Array));
  });
});
