import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxRolesAdminComponent } from '../../src/roles-admin.component';
import { FakeIamApi, ROLES } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxRolesAdminComponent', () => {
  it('filters roles, creates, clones, deletes non-system roles, and navigates to detail', async () => {
    const router = { navigate: vi.fn() };
    const route = {};
    const fixture = await renderComponent(StynxRolesAdminComponent, {
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
      ],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      search(): void;
      openCreateDialog(): void;
      createRole(body: { key: string; name: string }): void;
      openCloneDialog(role: typeof ROLES[number]): void;
      cloneRole(body: { key: string; name: string }): void;
      deleteRole(role: typeof ROLES[number]): void;
      openDetail(role: typeof ROLES[number]): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const toast = TestBed.inject(StynxToastService) as unknown as { push: ReturnType<typeof vi.fn> };

    component.searchForm.controls.q.setValue('view');
    access.search();
    access.openCreateDialog();
    access.createRole({ key: 'operator', name: 'Operator' });
    access.openCloneDialog(ROLES[0]!);
    access.cloneRole({ key: 'admin-copy', name: 'Admin copy' });
    access.deleteRole(ROLES[1]!);
    access.deleteRole(ROLES[0]!);
    access.openDetail(ROLES[0]!);

    expect(component.filteredRoles().map((role) => role.key)).toEqual(['viewer']);
    expect(api.createRole).toHaveBeenCalledWith({ key: 'operator', name: 'Operator' });
    expect(api.cloneRole).toHaveBeenCalledWith('role-1', { key: 'admin-copy', name: 'Admin copy' });
    expect(api.deleteRole).not.toHaveBeenCalledWith('role-2');
    expect(api.deleteRole).toHaveBeenCalledWith('role-1');
    expect(router.navigate).toHaveBeenCalledWith(['role-1'], { relativeTo: route });
    expect(toast.push).toHaveBeenCalledWith('iam.roles.delete.deleted', 'success');
  });
});
