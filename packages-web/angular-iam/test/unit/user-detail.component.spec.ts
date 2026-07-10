import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxUserDetailComponent } from '../../src/user-detail.component';
import type { StynxUserDetail } from '../../src/types';
import { FakeIamApi } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxUserDetailComponent', () => {
  it('loads user detail and persists overview, role, group, and lifecycle actions', async () => {
    const fixture = await renderComponent(StynxUserDetailComponent, { inputs: { userId: 'user-1' } });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      saveOverview(): void;
      toggleRole(id: string): void;
      saveRoles(): void;
      toggleGroup(id: string): void;
      saveGroups(): void;
      sendInvite(): void;
      forceLogout(): void;
      disableUser(): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const toast = TestBed.inject(StynxToastService) as unknown as { push: ReturnType<typeof vi.fn> };
    const changed: StynxUserDetail[] = [];
    component.userChanged.subscribe((user) => changed.push(user));

    component.overviewForm.setValue({ email: 'patched@example.test', firstName: 'Ada', lastName: '', locale: 'en-US' });
    access.saveOverview();
    access.toggleRole('role-2');
    access.saveRoles();
    access.toggleGroup('group-1');
    access.saveGroups();
    access.sendInvite();
    access.forceLogout();
    component.disableDialogOpen.set(true);
    access.disableUser();

    expect(fixture.nativeElement.textContent).toContain('ada@example.test');
    expect(api.patchUser).toHaveBeenCalledWith('user-1', { email: 'patched@example.test', firstName: 'Ada', locale: 'en-US' });
    expect(api.setUserRoles).toHaveBeenCalledWith('user-1', ['role-1', 'role-2']);
    expect(api.setUserGroups).toHaveBeenCalledWith('user-1', []);
    expect(api.inviteUser).toHaveBeenCalledWith('user-1');
    expect(api.forceLogoutUser).toHaveBeenCalledWith('user-1');
    expect(api.disableUser).toHaveBeenCalledWith('user-1');
    expect(changed).toHaveLength(1);
    expect(toast.push).toHaveBeenCalledWith('iam.users.detail.saved', 'success');
  });
});
