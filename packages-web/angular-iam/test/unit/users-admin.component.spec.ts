import { ActivatedRoute, Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { IamApiService } from '../../src/iam-api.service';
import { provideStynxIam } from '../../src/provide-iam';
import { STYNX_IAM_CLIENT } from '../../src/tokens';
import { StynxUsersAdminComponent } from '../../src/users-admin.component';
import type { PagedResult } from '../../src/types';
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

  it('clears search, computes labels, and keeps host selection working without a router', async () => {
    const fixture = await renderComponent(StynxUsersAdminComponent);
    const component = fixture.componentInstance;
    const access = component as unknown as {
      displayName(user: StynxUser): string;
      statusKey(user: StynxUser): string;
      clearSearch(): void;
      openDetail(user: StynxUser): void;
    };
    const api = TestBed.inject(IamApiService) as unknown as FakeIamApi;
    const selected: StynxUser[] = [];
    component.userSelected.subscribe((user) => selected.push(user));

    component.searchForm.controls.q.setValue('grace');
    access.clearSearch();
    access.openDetail(USERS[1]!);

    expect(component.searchForm.controls.q.value).toBe('');
    expect(component.searchForm.value).toEqual({ q: '' });
    expect(component.pageIndex()).toBe(0);
    expect(api.listUsers).toHaveBeenLastCalledWith({ page: 1, pageSize: 10 });
    expect(access.displayName(USERS[0]!)).toBe('Ada Lovelace');
    expect(access.displayName({ id: 'user-x', email: 'fallback@example.test' })).toBe('fallback@example.test');
    expect(access.statusKey({ id: 'user-x', email: 'x@example.test' })).toBe('iam.users.status.active');
    expect(access.statusKey(USERS[1]!)).toBe('iam.users.status.disabled');
    expect(selected).toEqual([USERS[1]]);
  });

  it('guards create dialog close while saving and reports create failures', async () => {
    const page: PagedResult<StynxUser> = {
      items: USERS,
      meta: { page: 1, pageSize: 10, total: USERS.length },
    };
    const api = new FakeIamApi();
    api.listUsers.mockReturnValue(of(page));
    api.createUser.mockReturnValue(throwError(() => 'opaque create failure'));
    const fixture = await renderComponent(StynxUsersAdminComponent, {
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      openCreateDialog(): void;
      closeCreateDialog(): void;
      createUser(body: StynxCreateUserRequest): void;
    };

    access.openCreateDialog();
    expect(component.createOpen()).toBe(true);
    expect(component.createError()).toBe('');

    component.createSaving.set(true);
    access.closeCreateDialog();
    expect(component.createOpen()).toBe(true);

    component.createSaving.set(false);
    access.closeCreateDialog();
    expect(component.createOpen()).toBe(false);
    expect(component.createError()).toBe('');

    access.openCreateDialog();
    access.createUser({ email: 'bad@example.test' });
    expect(component.createSaving()).toBe(false);
    expect(component.createOpen()).toBe(true);
    expect(component.createError()).toBe('iam.users.create.failed');
  });

  it('tracks deferred list and create loading flags exactly', async () => {
    const page: PagedResult<StynxUser> = {
      items: USERS,
      meta: { page: 1, pageSize: 10, total: USERS.length },
    };
    const list$ = new Subject<PagedResult<StynxUser>>();
    const create$ = new Subject<StynxUser>();
    const api = new FakeIamApi();
    api.listUsers.mockReturnValue(list$.asObservable());
    api.createUser.mockReturnValue(create$.asObservable());
    const fixture = await renderComponent(StynxUsersAdminComponent, {
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      openCreateDialog(): void;
      createUser(body: StynxCreateUserRequest): void;
    };

    expect(component.loading()).toBe(true);
    expect(component.error()).toBe('');
    expect(component.createOpen()).toBe(false);
    expect(component.createSaving()).toBe(false);
    expect(component.createError()).toBe('');

    list$.next(page);
    list$.complete();
    expect(component.loading()).toBe(false);
    expect(component.total()).toBe(USERS.length);

    access.openCreateDialog();
    component.createError.set('stale error');
    access.createUser({ email: 'new@example.test' });
    expect(component.createSaving()).toBe(true);
    expect(component.createError()).toBe('');
    expect(component.createOpen()).toBe(true);

    create$.next({ id: 'user-created', email: 'new@example.test' });
    create$.complete();
    expect(component.createSaving()).toBe(false);
    expect(component.createOpen()).toBe(false);
  });

  it('reports list and create Error messages exactly', async () => {
    const page: PagedResult<StynxUser> = {
      items: USERS,
      meta: { page: 3, pageSize: 50, total: 123 },
    };
    const api = new FakeIamApi();
    api.listUsers
      .mockReturnValueOnce(throwError(() => new Error('list failed')))
      .mockReturnValueOnce(of(page));
    api.createUser.mockReturnValue(throwError(() => new Error('email already exists')));
    const fixture = await renderComponent(StynxUsersAdminComponent, {
      providers: [{ provide: IamApiService, useValue: api }],
    });
    const component = fixture.componentInstance;
    const access = component as unknown as {
      search(): void;
      openCreateDialog(): void;
      createUser(body: StynxCreateUserRequest): void;
    };

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('list failed');

    component.searchForm.controls.q.setValue(' Ada ');
    access.search();
    expect(component.error()).toBe('');
    expect(component.total()).toBe(123);
    expect(component.pageIndex()).toBe(2);
    expect(component.pageSize()).toBe(50);
    expect(api.listUsers).toHaveBeenLastCalledWith({ q: 'Ada', page: 1, pageSize: 10 });

    access.openCreateDialog();
    access.createUser({ email: 'ada@example.test' });
    expect(component.createSaving()).toBe(false);
    expect(component.createError()).toBe('email already exists');
  });

  it('registers the IAM environment provider client and API service', () => {
    const client = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as StynxSdkClient;
    TestBed.configureTestingModule({
      providers: [
        provideStynxIam({
          clientFactory: () => client,
        }),
      ],
    });

    expect(TestBed.inject(STYNX_IAM_CLIENT)).toBe(client);
    expect(TestBed.inject(IamApiService)).toBeInstanceOf(IamApiService);
  });
});
