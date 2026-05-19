import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-web/angular-ui';
import { describe, expect, it, vi } from 'vitest';
import { IamApiService } from '../../src/iam-api.service';
import { StynxUsersAdminComponent } from '../../src/users-admin.component';
import type { StynxCreateUserRequest, StynxUser } from '../../src/types';
import { FakeIamApi, USERS } from '../support/fixtures';
import { renderComponent } from '../support/test-bed';

describe('StynxUsersAdminComponent', () => {
  it('renders user rows and drives search, pagination, creation, and selection', async () => {
    const router = { navigate: vi.fn() };
    const route = {};
    const fixture = await renderComponent(StynxUsersAdminComponent, {
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: route },
      ],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      search(): void;
      pageChanged(event: { pageIndex: number; pageSize: number }): void;
      openCreateDialog(): void;
      createUser(body: StynxCreateUserRequest): void;
      openDetail(user: StynxUser): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const toast = TestBed.inject(StynxToastService) as unknown as { push: ReturnType<typeof vi.fn> };
    const selected: StynxUser[] = [];
    component.userSelected.subscribe((user) => selected.push(user));

    expect(fixture.nativeElement.textContent).toContain('ada@example.test');
    component.searchForm.controls.q.setValue(' Ada ');
    access.search();
    access.pageChanged({ pageIndex: 1, pageSize: 25 });
    access.openCreateDialog();
    access.createUser({ email: 'new@example.test', sendInvite: true } satisfies StynxCreateUserRequest);
    access.openDetail(USERS[0]!);

    expect(api.listUsers).toHaveBeenCalledWith({ q: 'Ada', page: 1, pageSize: 10 });
    expect(api.listUsers).toHaveBeenCalledWith({ q: 'Ada', page: 2, pageSize: 25 });
    expect(api.createUser).toHaveBeenCalledWith({ email: 'new@example.test', sendInvite: true });
    expect(component.createOpen()).toBe(false);
    expect(selected).toEqual([USERS[0]]);
    expect(router.navigate).toHaveBeenCalledWith(['user-1'], { relativeTo: route });
    expect(toast.push).toHaveBeenCalledWith('iam.users.create.created', 'success');
  });
});
