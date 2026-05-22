import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { StynxEffectivePermissionsComponent } from '../../src/effective-permissions.component';
import { IamApiService } from '../../src/iam-api.service';
import type { StynxEffectivePermissions } from '../../src/types';
import { EFFECTIVE, FakeIamApi } from '../support/fixtures';
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
    expect(component.filterForm.value).toEqual({ q: '' });
  });

  it('exposes initial state and loading transitions for deferred permission loads', async () => {
    const permissions$ = new Subject<StynxEffectivePermissions>();
    const api = {
      getEffectivePermissions: vi.fn(() => permissions$.asObservable()),
    };
    const fixture = await renderComponent(StynxEffectivePermissionsComponent, {
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as { applySearch(): void; clearSearch(): void };

    expect(component.currentUserId()).toBe('');
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('');
    expect(component.search()).toBe('');
    expect(component.permissionsSnapshot()).toEqual({ userId: '', permissions: [] });
    expect(component.filterForm.value).toEqual({ q: '' });

    component.userId = 'user-deferred';
    expect(component.currentUserId()).toBe('user-deferred');
    expect(component.loading()).toBe(true);
    expect(component.error()).toBe('');

    permissions$.next(EFFECTIVE);
    permissions$.complete();
    expect(component.loading()).toBe(false);
    expect(component.permissionsSnapshot()).toEqual(EFFECTIVE);

    component.filterForm.controls.q.setValue('   ');
    access.applySearch();
    expect(component.search()).toBe('');
    expect(component.filteredPermissions().map((permission) => permission.key)).toEqual(['iam:users:read', 'iam:groups:write']);

    access.clearSearch();
    expect(component.filterForm.value).toEqual({ q: '' });
  });

  it('normalizes sparse permission grants and exposes empty-state search copy', async () => {
    const effective: StynxEffectivePermissions = {
      userId: 'user-9',
      permissions: [
        {
          permission: { key: 'iam:custom:approve' },
          grantedBy: [{ type: 'role', id: 'role-9', name: 'Approvers' }],
        },
        ...EFFECTIVE.permissions,
      ],
    };
    const api = {
      getEffectivePermissions: vi.fn(() => of(effective)),
    };
    const fixture = await renderComponent(StynxEffectivePermissionsComponent, {
      inputs: { userId: 'user-9' },
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      applySearch(): void;
      clearSearch(): void;
      emptyTitleKey(): string;
      emptyDescriptionKey(): string;
      sourceTypeKey(type: 'role' | 'group'): string;
    };

    component.filterForm.controls.q.setValue(' approvers ');
    access.applySearch();

    expect(component.search()).toBe('approvers');
    expect(component.filteredPermissions()).toEqual([
      expect.objectContaining({
        key: 'iam:custom:approve',
        resource: 'custom',
        action: 'approve',
        description: '',
      }),
    ]);
    expect(component.grantSourceCount()).toBe(1);
    expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.emptySearch.title');
    expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.emptySearch.description');
    expect(access.sourceTypeKey('role')).toBe('iam.effectivePermissions.source.role');
    expect(access.sourceTypeKey('group')).toBe('iam.effectivePermissions.source.group');

    access.clearSearch();
    expect(access.emptyTitleKey()).toBe('iam.effectivePermissions.empty.title');
    expect(access.emptyDescriptionKey()).toBe('iam.effectivePermissions.empty.description');
  });

  it('resets state for blank users and ignores refresh without a current user', async () => {
    const api = {
      getEffectivePermissions: vi.fn(() => of(EFFECTIVE)),
    };
    const fixture = await renderComponent(StynxEffectivePermissionsComponent, {
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as { refresh(): void };

    component.userId = 'user-1';
    component.userId = '';
    access.refresh();

    expect(api.getEffectivePermissions).toHaveBeenCalledTimes(1);
    expect(component.currentUserId()).toBe('');
    expect(component.permissionsSnapshot()).toEqual({ userId: '', permissions: [] });
    expect(component.error()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('surfaces exact error and fallback messages while clearing loading state', async () => {
    const failingApi = {
      getEffectivePermissions: vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('permission backend down')))
        .mockReturnValueOnce(throwError(() => 'opaque')),
    };
    const fixture = await renderComponent(StynxEffectivePermissionsComponent, {
      providers: [{ provide: IamApiService, useValue: failingApi }],
    });
    const component = fixture.componentInstance;

    component.userId = 'user-1';
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('permission backend down');

    component.userId = 'user-2';
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('iam.effectivePermissions.loadFailed');
  });
});
