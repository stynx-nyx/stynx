import { generateKeyPairSync, sign } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import { Controller, Get, Req, UseGuards, type INestApplication, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  StynxAuthModule,
  StynxAuthGuard,
  PublicTenantRoute,
  Permission,
  PermissionGuard,
} from '@stynx-nyx/auth';
import { Database, StynxDataModule, StynxPoolRegistry, type Transaction } from '@stynx-nyx/data';
import { RequestContextMutator, RequestContext, StynxError } from '@stynx-nyx/core';
import {
  InMemorySessionStore,
  SessionService,
  SessionJwtSigningService,
  SessionMirrorWriter,
  SessionRevocationList,
  STYNX_SESSIONS_OPTIONS,
  STYNX_SESSION_STORE,
  STYNX_SESSION_MIRROR,
  resolveSessionsOptions,
} from '@stynx-nyx/sessions';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import {
  STYNX_RESOLVED_TENANT_COMMAND_CONTEXT,
  type ResolvedTenantCommandContextPort,
} from '@stynx-nyx/contracts';
import { CatalogService } from '../../src/catalog.service.js';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import { LocaleService } from '../../src/locale.service.js';
import { StynxI18nModule } from '../../src/i18n.module.js';

export const TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
export const OTHER_TENANT_ID = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
export const ACTOR_ID = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const READER_ID = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const OTHER_ACTOR_ID = '0197481e-7294-7c53-8b03-5c36d7c2831d';
const DENIED_ID = '0197481e-7294-7c53-8b03-5c36d7c2831c';

@Controller('_i18n-public')
@UseGuards(StynxAuthGuard)
class PublicLocaleController {
  constructor(
    private readonly locale: LocaleService,
    private readonly context: RequestContext,
    private readonly moduleRef: ModuleRef,
    private readonly database: Database,
    private readonly admin: I18nAdminService,
    private readonly catalog: CatalogService,
  ) {}
  @Get('nominal')
  @PublicTenantRoute()
  nominal(@Req() request: object) {
    const proof = this.moduleRef
      .get<ResolvedTenantCommandContextPort>(STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, {
        strict: false,
      })
      .get(request);
    return {
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      mode: proof?.mode,
      translated: this.locale.t('title'),
    };
  }
  @Get('optional')
  @PublicTenantRoute({ optionalAuth: true })
  optional(@Req() request: object) {
    return this.nominal(request);
  }

  @Get('cache')
  @PublicTenantRoute()
  cache() {
    return this.catalog.translate('title', 'pt-BR', {}, this.context.tenantId);
  }

  @Get('tenant-admin')
  @PublicTenantRoute()
  tenantAdmin() {
    return this.admin.listTenantOverrides(this.context.tenantId!);
  }
  @Get('system')
  @UseGuards(PermissionGuard)
  @Permission('i18n:read')
  system() {
    return this.database.withSystemContext('HTTP cannot borrow internal i18n', () =>
      this.admin.listOverrides(TENANT_ID),
    );
  }

  @Get('error')
  @PublicTenantRoute()
  error() {
    throw new StynxError('title', { code: 'I18N_PUBLIC_TEST', status: 400, messageKey: 'title' });
  }

  @Get('protected-error')
  @UseGuards(PermissionGuard)
  @Permission('i18n:read')
  protectedError() {
    return this.error();
  }

  @Get('concurrent-error')
  @UseGuards(PermissionGuard)
  @Permission('i18n:read')
  async concurrentError() {
    await this.overlap();
    return this.error();
  }
  private readonly waiters: (() => void)[] = [];
  private async overlap() {
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      if (this.waiters.length === 2) for (const release of this.waiters.splice(0)) release();
    });
  }
  @Get('concurrent-nominal')
  @PublicTenantRoute()
  async concurrentNominal(@Req() request: object) {
    await this.overlap();
    return this.nominal(request);
  }
  @Get('concurrent-verified')
  @PublicTenantRoute({ optionalAuth: true })
  async concurrentVerified(@Req() request: object) {
    await this.overlap();
    return this.nominal(request);
  }
}

export class AuthenticatedI18nApp {
  constructor(
    private readonly controllers: Type<unknown>[] = [],
    private readonly workspaceRoot?: string,
    private readonly withTenancy = true,
  ) {}
  readonly store = new InMemorySessionStore();
  readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly issuer = 'https://i18n-security.test';
  postgres!: PostgresTestDatabase;
  app!: INestApplication;
  moduleRef!: TestingModule;
  database!: Database;
  requestContextMutator!: RequestContextMutator;
  readonly observations: Record<string, unknown>[] = [];
  readonly settingsQueries: Record<string, unknown>[] = [];

  async initialize() {
    this.postgres = await createPostgresTestDatabase('stynx_i18n_security', { useTemplate: false });
    const options = resolveSessionsOptions({
      issuer: this.issuer,
      redis: { url: 'redis://unused.test:6379' },
      jwt: {
        keySet: {
          currentKid: 'i18n-test',
          keys: [
            {
              kid: 'i18n-test',
              publicKeyPem: this.keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
              privateKeyPem: this.keys.privateKey
                .export({ type: 'pkcs8', format: 'pem' })
                .toString(),
            },
          ],
        },
      },
    });
    this.moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: this.postgres.connectionString('i18n-owner') },
            app: { connectionString: this.postgres.appConnectionString('i18n-app') },
            reader: {
              connectionString: this.postgres.appConnectionString('i18n-reader', 'stynx_reader'),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        StynxAuthModule.forRoot({ stynx: { issuer: this.issuer } }),
        ...(this.withTenancy
          ? [
              StynxTenancyModule.forRoot({
                headerName: 'X-Tenant-Id',
                publicTenant: { actorId: ACTOR_ID, resolveHost: () => TENANT_ID },
              }),
            ]
          : []),
        StynxI18nModule.forRoot({
          ...(this.workspaceRoot ? { workspaceRoot: this.workspaceRoot } : {}),
        }),
      ],
      controllers: [...(this.withTenancy ? [PublicLocaleController] : []), ...this.controllers],
      providers: [
        { provide: STYNX_SESSIONS_OPTIONS, useValue: options },
        { provide: STYNX_SESSION_STORE, useValue: this.store },
        { provide: STYNX_SESSION_MIRROR, useClass: SessionMirrorWriter },
        SessionJwtSigningService,
        SessionService,
        SessionRevocationList,
      ],
    }).compile();
    this.app = this.moduleRef.createNestApplication();
    await this.app.init();
    await this.postgres.ensureRoleLogin('stynx_app');
    await this.postgres.ensureRoleLogin('stynx_reader');
    this.database = this.moduleRef.get(Database);
    this.requestContextMutator = this.moduleRef.get(RequestContextMutator);
    const admin = await this.adminClient();
    try {
      for (const [id, slug] of [
        [TENANT_ID, 'i18n-matrix'],
        [OTHER_TENANT_ID, 'i18n-matrix-other'],
      ]) {
        await admin.query('insert into tenancy.tenants(id,slug,name) values($1,$2,$2)', [id, slug]);
        await admin.query(
          "insert into tenancy.tenant_settings(tenant_id,locale,settings) values($1,'pt-BR',$2::jsonb)",
          [
            id,
            JSON.stringify(
              id === TENANT_ID
                ? {
                    existing: true,
                    'i18n.override.en-US.title': 'Title',
                    'i18n.override.pt-BR.title': 'Titulo',
                  }
                : { 'i18n.override.pt-BR.title': 'Other tenant secret' },
            ),
          ],
        );
      }
      for (const [id, email] of [
        [ACTOR_ID, 'writer'],
        [READER_ID, 'reader'],
        [DENIED_ID, 'denied'],
        [OTHER_ACTOR_ID, 'other-writer'],
      ]) {
        await admin.query('insert into auth.users(id,email) values($1,$2)', [
          id,
          `${email}@i18n.test`,
        ]);
        await admin.query(
          'insert into auth.memberships(tenant_id,user_id,is_active) values($1,$2,true)',
          [id === OTHER_ACTOR_ID ? OTHER_TENANT_ID : TENANT_ID, id],
        );
      }
      await admin.query(
        "insert into auth.perms(key,description) values('i18n:read','Read overrides'),('i18n:write','Write overrides') on conflict(key) do nothing",
      );
      await admin.query(
        "insert into auth.direct_perms(membership_id,perm_id,effect) select m.id,p.id,'allow' from auth.memberships m cross join auth.perms p where (m.user_id in ($1,$3) and p.key in ('i18n:read','i18n:write')) or (m.user_id=$2 and p.key='i18n:read')",
        [ACTOR_ID, READER_ID, OTHER_ACTOR_ID],
      );
    } finally {
      await admin.end();
    }
    for (const [sid, userId, tenantId] of [
      ['writer', ACTOR_ID, TENANT_ID],
      ['reader', READER_ID, TENANT_ID],
      ['denied', DENIED_ID, TENANT_ID],
      ['other', ACTOR_ID, OTHER_TENANT_ID],
      ['otherWriter', OTHER_ACTOR_ID, OTHER_TENANT_ID],
    ]) {
      const now = new Date().toISOString(),
        future = new Date(Date.now() + 3600000).toISOString();
      await this.store.createSession({
        sid,
        userId,
        tenantId,
        cognitoSub: userId,
        refreshFamilyId: sid,
        refreshTokenHash: sid,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        expiresAt: future,
        idleExpiresAt: future,
      });
    }
    // Observe actual live transactions without replacing the owned Database or SQL.

    const observations = this.observations;
    const settingsQueries = this.settingsQueries;
    for (const method of ['tx', 'txIndependent'] as const) {
      const original = this.database[method].bind(this.database);
      vi.spyOn(this.database, method).mockImplementation((async (
        fn: (trx: Transaction) => Promise<unknown>,
        options?: Parameters<Database['tx']>[1],
      ) =>
        original(async (trx) => {
          const identity = await trx.query(
            "select current_user,session_user,current_setting('app.tenant_id',true) tenant,current_setting('app.actor_id',true) actor,current_setting('transaction_read_only') readonly",
          );
          observations.push({ ...identity.rows[0], requestedRole: options?.role });
          const originalQuery = trx.query;
          trx.query = ((...args: Parameters<Transaction['query']>) => {
            if (typeof args[0] === 'string' && args[0].includes('tenancy.tenant_settings'))
              settingsQueries.push({ ...identity.rows[0], sql: args[0] });
            return originalQuery.apply(trx, args);
          }) as Transaction['query'];
          try {
            return await fn(trx);
          } finally {
            trx.query = originalQuery;
          }
        }, options)) as Database['tx']);
    }
  }

  token(kind: 'writer' | 'reader' | 'denied' | 'other' | 'otherWriter' = 'writer'): string {
    const sub =
      kind === 'reader'
        ? READER_ID
        : kind === 'denied'
          ? DENIED_ID
          : kind === 'otherWriter'
            ? OTHER_ACTOR_ID
            : ACTOR_ID;
    const body = {
      iss: this.issuer,
      sub,
      sid: kind,
      tenant_id: kind === 'other' || kind === 'otherWriter' ? OTHER_TENANT_ID : TENANT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      // S-12 (SM-14): the verified token carries the actor's authorization, mirroring the
      // direct_perms seeded below; `other` keeps the writer's grants so tenancy denies it.
      perms:
        kind === 'writer' || kind === 'other' || kind === 'otherWriter'
          ? ['i18n:read', 'i18n:write']
          : kind === 'reader'
            ? ['i18n:read']
            : [],
      roles: [],
    };
    const input =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'i18n-test', typ: 'JWT' })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(JSON.stringify(body)).toString('base64url');
    return (
      input +
      '.' +
      sign('RSA-SHA256', Buffer.from(input), this.keys.privateKey).toString('base64url')
    );
  }
  async adminClient() {
    return this.postgres.connectAsAdmin();
  }
  async teardown() {
    await this.app?.close();
    await this.postgres?.dispose();
  }
  async poolIdentities() {
    const registry = this.moduleRef.get(StynxPoolRegistry);
    return Promise.all(
      ['app', 'reader'].map(
        async (role) =>
          (
            await registry.pools[role as 'app' | 'reader'].query(
              'select current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user',
            )
          ).rows[0],
      ),
    );
  }
}
