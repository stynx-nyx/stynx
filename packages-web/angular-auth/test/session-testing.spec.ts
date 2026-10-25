import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
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

  it('provides a typed session stub with the real session state shape and controllable signals', async () => {
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
    await expect(firstValueFrom(stub.active$)).resolves.toMatchObject({
      active: false,
      tenantId: null,
    });

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
    expect(stub.hasAllPermissions(['reports:*'])).toBe(true);
    expect(stub.hasAllPermissions(['other:*'])).toBe(false);

    stub.setPermissions(['admin:*']);
    expect(stub.hasAllPermissions(['admin:write'])).toBe(true);
    stub.deactivate();
    expect(stub.active()).toBe(false);
    expect(stub.state().tenantId).toBe(null);
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


  it('preserves callable metadata, own-key order and method descriptors for every public spy', () => {
    const { calls } = createStynxSessionStub();
    for (const [name, spy] of Object.entries(calls)) {
      expect(spy.name).toBe('spy');
      expect(spy.length).toBe(0);
      expect(spy.getMockName()).toBe(name);
      expect(Reflect.ownKeys(spy)).toEqual([
        'length', 'name', '_isMockFunction', 'mock', 'getMockName', 'mockClear', 'mockImplementation',
      ]);
      expect(Object.getOwnPropertyDescriptor(spy, '_isMockFunction')).toEqual({
        value: true, writable: false, enumerable: false, configurable: false,
      });
      expect(Object.getOwnPropertyDescriptor(spy, 'mock')).toEqual({
        value: spy.mock, writable: false, enumerable: true, configurable: false,
      });
      for (const [method, arity] of [
        [spy.getMockName, 0], [spy.mockClear, 0], [spy.mockImplementation, 1],
      ] as const) {
        expect(method.name).toBe('');
        expect(method.length).toBe(arity);
      }
      for (const key of ['getMockName', 'mockClear', 'mockImplementation']) {
        expect(Object.getOwnPropertyDescriptor(spy, key)).toMatchObject({
          writable: true, enumerable: true, configurable: true,
        });
      }
    }
  });

  it('retains calls identity, replacement behavior and recording before the original thrown error', () => {
    const stub = createStynxSessionStub();
    const spy = stub.calls.login;
    const calls = spy.mock.calls;
    const sentinel = new Error('session implementation sentinel');
    expect(stub.login).toBe(spy);
    expect(spy.mockImplementation(() => {
      expect(calls).toEqual([[]]);
      throw sentinel;
    })).toBe(spy);
    let caught: unknown;
    try { stub.login(); } catch (error) { caught = error; }
    expect(caught).toBe(sentinel);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
    expect(spy.mock.calls).toBe(calls);
    expect(spy.mockClear()).toBe(spy);
    expect(spy.mock.calls).toBe(calls);
    expect(calls).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    let invoked = 0;
    expect(spy.mockImplementation(() => { invoked += 1; })).toBe(spy);
    expect(stub.login()).toBeUndefined();
    expect(invoked).toBe(1);
    expect(calls).toEqual([[]]);
    const promise = Promise.resolve('replacement-token');
    const accessToken = stub.calls.getAccessToken;
    expect(accessToken.mockImplementation(() => promise)).toBe(accessToken);
    expect(stub.getAccessToken()).toBe(promise);
  });
});
