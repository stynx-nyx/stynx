import '@angular/compiler';
import {
  Injector,
  createEnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import type { EnvironmentInjector, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { StynxToastService } from '@stynx-nyx/angular-ui';
import { firstValueFrom } from 'rxjs';
import { StynxActiveSessionsComponent } from '../src/active-sessions.component';
import { provideStynxSessions } from '../src/provide-sessions';
import { SdkSessionsAdapter } from '../src/sdk-sessions.adapter';
import {
  STYNX_SESSIONS_ADAPTER,
  STYNX_SESSIONS_CLIENT,
} from '../src/tokens';
import type {
  StynxActiveSession,
  StynxSessionsAdapter,
  StynxSessionsSdkClient,
} from '../src/types';
import { renderComponent } from './support/test-bed';

function createJwt(claims: Record<string, unknown>): string {
  return [
    'eyJhbGciOiJub25lIn0',
    Buffer.from(JSON.stringify(claims)).toString('base64url'),
    '',
  ].join('.');
}

function createClient(
  sessions: unknown[] = [],
): StynxSessionsSdkClient & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(async () => sessions),
    post: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  } as never;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function createComponent(providers: Provider[]): StynxActiveSessionsComponent {
  const injector = Injector.create({ providers });
  return runInInjectionContext(injector, () => new StynxActiveSessionsComponent());
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe('@stynx-nyx/angular-sessions', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders active sessions with current-device labelling and revoke actions', async () => {
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [
        {
          sid: 'sid-current',
          sessionId: 'sid-current',
          tenantId: 'tenant-a',
          createdAt: '2026-05-20T10:00:00.000Z',
          expiresAt: '2026-05-20T11:00:00.000Z',
          lastIp: '127.0.0.1',
          userAgent: 'Safari',
          lastSeenAt: null,
        },
        {
          sid: 'sid-other',
          sessionId: 'sid-other',
          tenantId: 'tenant-b',
          createdAt: '2026-05-20T09:00:00.000Z',
          expiresAt: '2026-05-20T12:00:00.000Z',
          lastIp: null,
          userAgent: null,
          lastSeenAt: null,
        },
      ]),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };
    const fixture = await renderComponent(StynxActiveSessionsComponent, {
      inputs: { adapter },
      providers: [
        { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string) => ({
              'sessions.active.actions.revoke': 'Revoke',
              'sessions.active.actions.revokeOthers': 'Revoke other sessions',
              'sessions.active.columns.createdAt': 'Created',
              'sessions.active.columns.expiresAt': 'Expires',
              'sessions.active.columns.lastIp': 'IP',
              'sessions.active.columns.lastSeenAt': 'Last seen',
              'sessions.active.columns.userAgent': 'Browser',
              'sessions.active.current': 'This device',
              'sessions.active.labels.thisDevice': 'This device',
              'sessions.active.values.unknown': 'Unknown',
            })[key] ?? key,
          },
        },
        { provide: StynxToastService, useValue: { push: vi.fn() } },
      ],
    });

    await fixture.componentInstance.load();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="active-session-current-sid-current"]')?.textContent).toContain('This device');
    expect(host.querySelector('[data-testid="active-session-revoke-sid-other"]')?.textContent).toContain('Revoke');
    expect(host.textContent).toContain('tenant-b');
  });

  it('defines stable injection tokens for the sessions client and adapter', () => {
    expect(STYNX_SESSIONS_CLIENT.toString()).toContain('STYNX_SESSIONS_CLIENT');
    expect(STYNX_SESSIONS_ADAPTER.toString()).toContain('STYNX_SESSIONS_ADAPTER');
  });

  it('normalizes SDK session payloads, derives the current session, and calls SDK endpoints', async () => {
    const client = createClient([
      {
        sid: 'sid-from-jwt',
        tenant_id: 'tenant-a',
        created_at: '2026-05-20T10:00:00.000Z',
        expires_at: '2026-05-20T11:00:00.000Z',
        last_ip: '127.0.0.1',
        user_agent: 'Firefox',
        last_seen_at: '2026-05-20T10:30:00.000Z',
        scope: 'tenant',
      },
      {
        sessionId: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-05-20T09:00:00.000Z',
        expiresAt: '2026-05-20T12:00:00.000Z',
        current: true,
      },
      {
        sid: 'sid-not-current',
        tenantId: 'tenant-c',
        createdAt: '2026-05-20T08:00:00.000Z',
        expiresAt: '2026-05-20T13:00:00.000Z',
      },
    ]);

    const injector = Injector.create({
      providers: [
        SdkSessionsAdapter,
        { provide: STYNX_SESSIONS_CLIENT, useValue: client },
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({
              sid: null,
              accessToken: createJwt({ sid: 'sid-from-jwt' }),
            }),
          },
        },
      ],
    });

    const adapter = injector.get(SdkSessionsAdapter);

    await expect(firstValueFrom(adapter.list())).resolves.toEqual([
      {
        sid: 'sid-from-jwt',
        sessionId: 'sid-from-jwt',
        tenantId: 'tenant-a',
        createdAt: '2026-05-20T10:00:00.000Z',
        expiresAt: '2026-05-20T11:00:00.000Z',
        lastIp: '127.0.0.1',
        userAgent: 'Firefox',
        lastSeenAt: '2026-05-20T10:30:00.000Z',
        current: true,
        scope: 'tenant',
      },
      {
        sid: 'sid-other',
        sessionId: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-05-20T09:00:00.000Z',
        expiresAt: '2026-05-20T12:00:00.000Z',
        lastIp: null,
        userAgent: null,
        lastSeenAt: null,
        current: true,
      },
      {
        sid: 'sid-not-current',
        sessionId: 'sid-not-current',
        tenantId: 'tenant-c',
        createdAt: '2026-05-20T08:00:00.000Z',
        expiresAt: '2026-05-20T13:00:00.000Z',
        lastIp: null,
        userAgent: null,
        lastSeenAt: null,
        current: false,
      },
    ]);

    await firstValueFrom(adapter.revoke('sid with/slash'));
    await firstValueFrom(adapter.revokeOthers());

    expect(client.get).toHaveBeenCalledWith('/auth/sessions');
    expect(client.delete).toHaveBeenCalledWith('/auth/sessions/sid%20with%2Fslash');
    expect(client.post).toHaveBeenCalledWith('/auth/sessions/revoke-others', {});
  });

  it('normalizes missing SDK fields without requiring an auth session provider', async () => {
    const client = createClient([{}]);
    const injector = Injector.create({
      providers: [
        SdkSessionsAdapter,
        { provide: STYNX_SESSIONS_CLIENT, useValue: client },
      ],
    });

    await expect(firstValueFrom(injector.get(SdkSessionsAdapter).list())).resolves.toEqual([
      {
        sid: '',
        sessionId: '',
        tenantId: '',
        createdAt: '',
        expiresAt: '',
        lastIp: null,
        userAgent: null,
        lastSeenAt: null,
        current: false,
      },
    ]);
  });

  it('uses snapshot sid before token claims and ignores empty token sid claims', async () => {
    const client = createClient([
      {
        sid: 'sid-from-snapshot',
        tenantId: 'tenant-a',
        createdAt: '2026-05-20T10:00:00.000Z',
        expiresAt: '2026-05-20T11:00:00.000Z',
      },
    ]);
    const injector = Injector.create({
      providers: [
        SdkSessionsAdapter,
        { provide: STYNX_SESSIONS_CLIENT, useValue: client },
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({
              sid: 'sid-from-snapshot',
              accessToken: createJwt({ sid: 'sid-from-token' }),
            }),
          },
        },
      ],
    });

    await expect(firstValueFrom(injector.get(SdkSessionsAdapter).list())).resolves.toEqual([
      expect.objectContaining({
        sid: 'sid-from-snapshot',
        current: true,
      }),
    ]);

    const emptySidClient = createClient([
      {
        sid: '',
        tenantId: 'tenant-a',
        createdAt: '2026-05-20T10:00:00.000Z',
        expiresAt: '2026-05-20T11:00:00.000Z',
      },
    ]);
    const emptySidInjector = Injector.create({
      providers: [
        SdkSessionsAdapter,
        { provide: STYNX_SESSIONS_CLIENT, useValue: emptySidClient },
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({
              sid: null,
              accessToken: createJwt({ sid: '' }),
            }),
          },
        },
      ],
    });

    await expect(firstValueFrom(emptySidInjector.get(SdkSessionsAdapter).list())).resolves.toEqual([
      expect.objectContaining({
        sid: '',
        current: false,
      }),
    ]);
  });

  it('fails fast when the SDK adapter is used without a client provider', () => {
    const injector = Injector.create({
      providers: [
        SdkSessionsAdapter,
        {
          provide: StynxSessionService,
          useValue: { snapshot: () => ({ sid: 'sid-current' }) },
        },
      ],
    });

    const adapter = injector.get(SdkSessionsAdapter);

    expect(() => adapter.list()).toThrow(
      'SdkSessionsAdapter requires provideStynxSessions({ clientFactory }).',
    );
  });

  it('provides a default SDK adapter and allows explicit adapter overrides', async () => {
    const client = createClient([]);
    const override: StynxSessionsAdapter = {
      list: vi.fn(async () => []),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };

    const parent = Injector.create({
      providers: [
        {
          provide: StynxSessionService,
          useValue: { snapshot: () => ({ sid: 'sid-current' }) },
        },
      ],
    });
    const defaultInjector = createEnvironmentInjector([
      provideStynxSessions({
        clientFactory: () => client,
      }),
    ], parent as unknown as EnvironmentInjector);

    expect(runInInjectionContext(defaultInjector, () => inject(STYNX_SESSIONS_CLIENT))).toBe(client);
    expect(
      runInInjectionContext(defaultInjector, () => inject(STYNX_SESSIONS_ADAPTER)),
    ).toBeInstanceOf(SdkSessionsAdapter);
    defaultInjector.destroy();

    const overrideInjector = createEnvironmentInjector([
      provideStynxSessions({
        adapter: () => override,
      }),
    ], Injector.create({ providers: [] }) as unknown as EnvironmentInjector);

    await expect(
      runInInjectionContext(overrideInjector, () => inject(STYNX_SESSIONS_ADAPTER)).list(),
    ).resolves.toEqual([]);
    expect(override.list).toHaveBeenCalledTimes(1);
    overrideInjector.destroy();
  });

  it('loads active sessions with current-device, metadata, and empty-state behavior', async () => {
    const state: StynxActiveSession[] = [
      {
        sid: 'sid-current',
        tenantId: 'tenant-a',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
        lastSeenAt: '2026-04-24T00:30:00.000Z',
        lastIp: '10.0.0.1',
        userAgent: 'Safari on macOS',
      },
      {
        sid: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
        lastSeenAt: null,
        lastIp: null,
        userAgent: null,
      },
    ];
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [...state]),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };

    const component = createComponent([
      { provide: STYNX_SESSIONS_ADAPTER, useValue: adapter },
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
      { provide: StynxToastService, useValue: { push: vi.fn() } },
      { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
    ]);

    expect(component.busy()).toBe(false);
    expect(component.confirmingRevokeOthers()).toBe(false);

    await component.load();

    expect(component.sessions).toEqual([
      {
        sid: 'sid-current',
        tenantId: 'tenant-a',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
        lastSeenAt: '2026-04-24T00:30:00.000Z',
        lastIp: '10.0.0.1',
        userAgent: 'Safari on macOS',
        current: true,
      },
      {
        sid: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
        lastSeenAt: null,
        lastIp: null,
        userAgent: null,
        current: false,
      },
    ]);

    state.splice(0);
    await component.load();

    expect(component.sessions).toEqual([]);
  });

  it('revokes sessions, reloads state, clears busy state, and emits translated warning toasts', async () => {
    const state: StynxActiveSession[] = [
      {
        sid: 'sid-current',
        tenantId: 'tenant-a',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
      },
      {
        sid: 'sid-other',
        tenantId: 'tenant-b',
        createdAt: '2026-04-24T00:00:00.000Z',
        expiresAt: '2026-04-24T01:00:00.000Z',
      },
    ];
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [...state]),
      revoke: vi.fn(async (sid: string) => {
        state.splice(state.findIndex((entry) => entry.sid === sid), 1);
      }),
      revokeOthers: vi.fn(async () => {
        state.splice(1);
      }),
    };
    const toast = { push: vi.fn() };

    const component = createComponent([
      { provide: STYNX_SESSIONS_ADAPTER, useValue: adapter },
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
      { provide: StynxToastService, useValue: toast },
      { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
    ]);

    await component.load();
    expect(component.sessions).toHaveLength(2);

    await component.revoke('sid-other');

    expect(adapter.revoke).toHaveBeenCalledWith('sid-other');
    expect(toast.push).toHaveBeenCalledWith('sessions.active.toast.revoked', 'warning');
    expect(component.sessions).toHaveLength(1);
    expect(component.busy()).toBe(false);

    state.push({
      sid: 'sid-third',
      tenantId: 'tenant-c',
      createdAt: '2026-04-24T00:00:00.000Z',
      expiresAt: '2026-04-24T01:00:00.000Z',
    });
    await component.load();
    component.confirmingRevokeOthers.set(true);

    await component.revokeOthers();

    expect(adapter.revokeOthers).toHaveBeenCalledTimes(1);
    expect(toast.push).toHaveBeenCalledWith('sessions.active.toast.revokedOthers', 'warning');
    expect(component.confirmingRevokeOthers()).toBe(false);
    expect(component.sessions.map((session) => session.sid)).toEqual(['sid-current']);
    expect(component.busy()).toBe(false);
  });

  it('keeps busy state true until revoke operations settle', async () => {
    const revokeDeferred = deferred<void>();
    const revokeOthersDeferred = deferred<void>();
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => []),
      revoke: vi.fn(() => revokeDeferred.promise),
      revokeOthers: vi.fn(() => revokeOthersDeferred.promise),
    };
    const component = createComponent([
      { provide: STYNX_SESSIONS_ADAPTER, useValue: adapter },
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
      { provide: StynxToastService, useValue: { push: vi.fn() } },
      { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
    ]);

    const revoke = component.revoke('sid-other');
    await Promise.resolve();
    expect(component.busy()).toBe(true);
    revokeDeferred.resolve();
    await revoke;
    expect(component.busy()).toBe(false);

    const revokeOthers = component.revokeOthers();
    await Promise.resolve();
    expect(component.busy()).toBe(true);
    revokeOthersDeferred.resolve();
    await revokeOthers;
    expect(component.busy()).toBe(false);
  });

  it('falls back to untranslated toast keys when no i18n provider is configured', async () => {
    const adapter: StynxSessionsAdapter = {
      list: vi.fn(async () => []),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };
    const toast = { push: vi.fn() };
    const component = createComponent([
      { provide: STYNX_SESSIONS_ADAPTER, useValue: adapter },
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
      { provide: StynxToastService, useValue: toast },
    ]);

    await component.revoke('sid-other');

    expect(toast.push).toHaveBeenCalledWith('sessions.active.toast.revoked', 'warning');
  });

  it('throws a clear error when no adapter is provided', async () => {
    const component = createComponent([
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-current' }) } },
      { provide: StynxToastService, useValue: { push: vi.fn() } },
    ]);

    await expect(component.load()).rejects.toThrow(
      'StynxActiveSessionsComponent requires an adapter input or provideStynxSessions(...).',
    );
  });

  it('prefers an input adapter over the provider adapter', async () => {
    const providerAdapter: StynxSessionsAdapter = {
      list: vi.fn(async () => {
        throw new Error('provider adapter should not be used');
      }),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };
    const inputAdapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [
        {
          sid: 'sid-input',
          tenantId: 'tenant-input',
          createdAt: '2026-04-24T00:00:00.000Z',
          expiresAt: '2026-04-24T01:00:00.000Z',
        },
      ]),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };

    const component = createComponent([
      { provide: STYNX_SESSIONS_ADAPTER, useValue: providerAdapter },
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-input' }) } },
      { provide: StynxToastService, useValue: { push: vi.fn() } },
      { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
    ]);
    component.adapter = inputAdapter;

    await component.load();

    expect(inputAdapter.list).toHaveBeenCalledTimes(1);
    expect(providerAdapter.list).not.toHaveBeenCalledTimes(1);
    expect(component.sessions[0]).toMatchObject({
      sid: 'sid-input',
      current: true,
    });
  });

  it('accepts an input adapter without a provider adapter', async () => {
    const inputAdapter: StynxSessionsAdapter = {
      list: vi.fn(async () => [
        {
          sid: 'sid-input-only',
          tenantId: 'tenant-input',
          createdAt: '2026-04-24T00:00:00.000Z',
          expiresAt: '2026-04-24T01:00:00.000Z',
        },
      ]),
      revoke: vi.fn(async () => undefined),
      revokeOthers: vi.fn(async () => undefined),
    };
    const component = createComponent([
      { provide: StynxSessionService, useValue: { snapshot: () => ({ sid: 'sid-input-only' }) } },
      { provide: StynxToastService, useValue: { push: vi.fn() } },
      { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
    ]);
    component.adapter = inputAdapter;

    await component.load();

    expect(component.sessions[0]).toMatchObject({
      sid: 'sid-input-only',
      current: true,
    });
  });
});
