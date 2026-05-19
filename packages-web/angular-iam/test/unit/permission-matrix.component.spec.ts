import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-web/angular-ui';
import { describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxPermissionMatrixComponent } from '../../src/permission-matrix.component';
import { FakeIamApi } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxPermissionMatrixComponent', () => {
  it('filters permissions, toggles grants, selects resources, and saves changes', async () => {
    const fixture = await renderComponent(StynxPermissionMatrixComponent, { inputs: { roleId: 'role-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      applySearch(): void;
      togglePermission(key: string): void;
      selectResource(group: ReturnType<StynxPermissionMatrixComponent['groups']>[number]): void;
      clearResource(group: ReturnType<StynxPermissionMatrixComponent['groups']>[number]): void;
      save(): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const toast = TestBed.inject(StynxToastService) as unknown as { push: ReturnType<typeof vi.fn> };
    const changed: string[][] = [];
    component.permissionsChanged.subscribe((keys) => changed.push(keys));

    component.filterForm.controls.q.setValue('custom');
    access.applySearch();
    access.togglePermission('iam:custom:approve');
    const group = component.groups()[0]!;
    access.selectResource(group);
    access.clearResource(group);
    access.save();

    expect(component.filteredPermissions().map((permission) => permission.key)).toContain('iam:custom:approve');
    expect(api.setRolePermissions).toHaveBeenCalledWith('role-1', expect.any(Array));
    expect(changed).toHaveLength(1);
    expect(toast.push).toHaveBeenCalledWith('iam.roles.permissions.savedToast', 'success');
  });
});
