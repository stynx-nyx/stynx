import { computed, signal } from '@angular/core';
import { makeEnvironmentProviders, type EnvironmentProviders, type Signal } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, type Observable } from 'rxjs';
import {
  permissionMatches,
  StynxSessionService,
  STYNX_SESSION_AUTH_PROVIDER,
  type StynxSessionState,
} from '@stynx-nyx/angular-auth';

type SessionMethods = Pick<StynxSessionService,
  | 'login'
  | 'loginRedirect'
  | 'completeLogin'
  | 'logout'
  | 'getAccessToken'
  | 'refresh'
  | 'onAuthFailure'
  | 'switchTenant'
  | 'hasAllPermissions'
  | 'hasAnyPermissions'
  | 'snapshot'
>;

export interface StynxSessionStub extends SessionMethods {
  readonly state: Signal<StynxSessionState>;
  readonly active: Signal<boolean>;
  readonly active$: Observable<StynxSessionState>;
  readonly calls: StynxSessionStubCalls;
  setSession(session: StynxSessionState): void;
  setPermissions(permissions: string[]): void;
  deactivate(): void;
}

type Spy<Args extends unknown[], Result> = ((...args: Args) => Result) & {
  readonly _isMockFunction: true;
  readonly mock: { readonly calls: Args[] };
  getMockName(): string;
  mockClear(): Spy<Args, Result>;
  mockImplementation(implementation: (...args: Args) => Result): Spy<Args, Result>;
};

export interface StynxSessionStubCalls {
  login: Spy<[], void>;
  loginRedirect: Spy<[], void>;
  completeLogin: Spy<[url?: string], Promise<StynxSessionState>>;
  logout: Spy<[], Promise<void>>;
  getAccessToken: Spy<[], Promise<string | null>>;
  refresh: Spy<[], Promise<string | null>>;
  onAuthFailure: Spy<[], Promise<void>>;
  switchTenant: Spy<[tenantId: string], Promise<StynxSessionState>>;
}

const inactiveState = (): StynxSessionState => ({
  active: false,
  accessToken: null,
  refreshToken: null,
  sid: null,
  permissions: [],
  tenantId: null,
  claims: null,
});

function createSpy<Args extends unknown[], Result>(
  name: string,
  implementation: (...args: Args) => Result,
): Spy<Args, Result> {
  const calls: Args[] = [];
  const spy = ((...args: Args) => {
    calls.push(args);
    return implementation(...args);
  }) as Spy<Args, Result>;
  Object.defineProperties(spy, {
    _isMockFunction: { value: true },
    mock: { value: { calls }, enumerable: true },
  });
  spy.getMockName = () => name;
  spy.mockClear = () => {
    calls.splice(0, calls.length);
    return spy;
  };
  spy.mockImplementation = (next) => {
    implementation = next;
    return spy;
  };
  return spy;
}

export function createStynxSessionStub(
  initial: Partial<StynxSessionState> = {},
): StynxSessionStub {
  const stateSignal = signal<StynxSessionState>({
    ...inactiveState(),
    ...initial,
    permissions: [...(initial.permissions ?? [])],
  });
  const readState = () => stateSignal();
  const stateChanges = new BehaviorSubject(stateSignal());
  const updateState = (session: StynxSessionState) => {
    stateSignal.set(session);
    stateChanges.next(session);
  };
  const calls: StynxSessionStubCalls = {
    login: createSpy('login', () => undefined),
    loginRedirect: createSpy('loginRedirect', () => undefined),
    completeLogin: createSpy('completeLogin', async () => readState()),
    logout: createSpy('logout', async () => undefined),
    getAccessToken: createSpy('getAccessToken', async () => readState().accessToken),
    refresh: createSpy('refresh', async () => readState().accessToken),
    onAuthFailure: createSpy('onAuthFailure', async () => undefined),
    switchTenant: createSpy('switchTenant', async (_tenantId: string) => readState()),
  };
  const state = stateSignal.asReadonly();
  const active = computed(() => stateSignal().active);
  const stub: StynxSessionStub = {
    state,
    active,
    active$: stateChanges.asObservable().pipe(distinctUntilChanged()),
    calls,
    login: calls.login,
    loginRedirect: calls.loginRedirect,
    completeLogin: calls.completeLogin,
    logout: calls.logout,
    getAccessToken: calls.getAccessToken,
    refresh: calls.refresh,
    onAuthFailure: calls.onAuthFailure,
    switchTenant: calls.switchTenant,
    hasAllPermissions: (required) => required.every((permission) =>
      stateSignal().permissions.some((granted) => permissionMatches(granted, permission))),
    hasAnyPermissions: (required) => required.some((permission) =>
      stateSignal().permissions.some((granted) => permissionMatches(granted, permission))),
    snapshot: readState,
    setSession: (session) => updateState({ ...session, permissions: [...session.permissions] }),
    setPermissions: (permissions) => updateState({
      ...stateSignal(),
      permissions: [...permissions],
    }),
    deactivate: () => updateState(inactiveState()),
  };
  return stub;
}

export function provideStynxSessionStub(stub = createStynxSessionStub()): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: StynxSessionService, useValue: stub },
    { provide: STYNX_SESSION_AUTH_PROVIDER, useValue: stub },
  ]);
}
