import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { StynxEffectivePermissionsComponent } from '../../src/effective-permissions.component';
import { IamApiService } from '../../src/iam-api.service';
import { FakeIamApi } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxEffectivePermissionsComponent', () => {
  it('loads effective grants, filters by grant source, refreshes, and clears search state', async () => {
    const fixture = await renderComponent(StynxEffectivePermissionsComponent, { inputs: { userId: 'user-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as { applySearch(): void; refresh(): void; clearSearch(): void };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const loaded: unknown[] = [];
    component.permissionsLoaded.subscribe((permissions) => loaded.push(permissions));

    component.filterForm.controls.q.setValue('operations');
    access.applySearch();

    expect(fixture.nativeElement.textContent).toContain('iam:users:read');
    expect(component.filteredPermissions().map((permission) => permission.grant.permission.key)).toEqual(['iam:groups:write']);
    access.refresh();
    access.clearSearch();
    expect(api.getEffectivePermissions).toHaveBeenCalledTimes(2);
    expect(loaded).toHaveLength(1);
    expect(component.search()).toBe('');
  });
});
