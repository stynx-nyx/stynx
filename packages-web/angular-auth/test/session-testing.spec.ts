import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import {
  createStynxSessionStub,
  provideStynxSessionStub,
} from '@stynx-nyx/angular-auth/testing';

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe('@stynx-nyx/angular-auth/testing', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('provides a typed session stub with the real session state shape and controllable signals', () => {
    const stub = createStynxSessionStub();
    TestBed.configureTestingModule({ providers: [provideStynxSessionStub(stub)] });
    const session = TestBed.inject(StynxSessionService);

    expect(session).toBe(stub);
    expect(stub.state()).toEqual({
      active: false,
      accessToken: null,
      refreshToken: null,
      sid: null,
      permissions: [],
      tenantId: null,
      claims: null,
    });
    expect(stub.active()).toBe(false);
    expect(stub.active$).toBeDefined();

    stub.setSession({
      active: true,
      accessToken: 'access',
      refreshToken: 'refresh',
      sid: 'sid-1',
      permissions: ['documents:read', 'reports:*'],
      tenantId: 'tenant-1',
      claims: { sub: 'user-1' },
    });
    expect(stub.active()).toBe(true);
    expect(stub.hasAllPermissions(['documents:read', 'reports:view'])).toBe(true);
    expect(stub.hasAnyPermissions(['admin:write', 'reports:view'])).toBe(true);
    expect(stub.hasAllPermissions(['reports:*'])).toBe(false);

    stub.setPermissions(['admin:*']);
    expect(stub.hasAllPermissions(['admin:write'])).toBe(true);
    stub.deactivate();
    expect(stub.active()).toBe(false);
    expect(stub.state().tenantId).toBeNull();
  });

  it('records calls for the public auth methods', async () => {
    const stub = createStynxSessionStub();
    stub.login();
    stub.loginRedirect();
    await stub.completeLogin('/callback');
    await stub.logout();
    await stub.getAccessToken();
    await stub.refresh();
    await stub.onAuthFailure();
    await stub.switchTenant('tenant-2');

    expect(stub.calls.login).toHaveBeenCalledOnce();
    expect(stub.calls.loginRedirect).toHaveBeenCalledOnce();
    expect(stub.calls.completeLogin).toHaveBeenCalledWith('/callback');
    expect(stub.calls.logout).toHaveBeenCalledOnce();
    expect(stub.calls.getAccessToken).toHaveBeenCalledOnce();
    expect(stub.calls.refresh).toHaveBeenCalledOnce();
    expect(stub.calls.onAuthFailure).toHaveBeenCalledOnce();
    expect(stub.calls.switchTenant).toHaveBeenCalledWith('tenant-2');
  });
});
