import { createRequire } from 'node:module';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { Controller, Get, Inject, Param, UseGuards, type INestApplication } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Database as DatabaseType, Transaction } from '@stynx-nyx/data';
import type {
  PrivacyService as PrivacyServiceType,
  PrivacyRule,
  PrivacyObjectStore,
} from '../../src/index.js';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import { stringify } from 'yaml';

// Public compiled package graph, without source aliases or owned component replacements.
const require = createRequire(import.meta.url);
const Core = require('@stynx-nyx/core') as typeof import('@stynx-nyx/core');
const Data = require('@stynx-nyx/data') as typeof import('@stynx-nyx/data');
const Auth = require('@stynx-nyx/auth') as typeof import('@stynx-nyx/auth');
const Sessions = require('@stynx-nyx/sessions') as typeof import('@stynx-nyx/sessions');
const Tenancy = require('@stynx-nyx/tenancy') as typeof import('@stynx-nyx/tenancy');
const Privacy = require('@stynx-nyx/privacy') as typeof import('@stynx-nyx/privacy');

export const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
export const OTHER_TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
export const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';
export const READER = '0197481e-7294-7c53-8b03-5c36d7c2831b';
export const DENIED = '0197481e-7294-7c53-8b03-5c36d7c2831c';
export const OTHER_ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831d';
export const SUBJECT = '0197481e-7294-7c53-8b03-5c36d7c2831e';
export const FOREIGN_SUBJECT = '0197481e-7294-7c53-8b03-5c36d7c2831f';
export const INACTIVE_SUBJECT = '0197481e-7294-7c53-8b03-5c36d7c28320';
export const SALT = 'independent privacy fixture secret';

// White-box defensive seam only: these TypeScript-private methods are not product API.
type CapturedPrivacyAuthority = {
  requireExportAuthority(tenantId: string, actorId: string): void;
  runTransaction<T>(
    callback: (transaction: Transaction) => Promise<T>,
    tenantId: string,
    readonly: boolean,
    actorId: string,
  ): Promise<T>;
};
type CapturedArgumentFault = 'tenant' | 'actor' | 'valid';

@Controller('_privacy-test')
@UseGuards(Auth.StynxAuthGuard)
export class PrivacyBoundaryController {
  readonly capturedAuthorityFailures: unknown[] = [];
  capturedTransactionCallbacks = 0;
  constructor(
    @Inject(Privacy.PrivacyService)
    private readonly privacy: PrivacyServiceType,
    @Inject(Data.Database) private readonly database: DatabaseType,
    @Inject(Core.RequestContext)
    private readonly context: InstanceType<typeof Core.RequestContext>,
    @Inject(Core.RequestContextMutator)
    private readonly mutator: InstanceType<typeof Core.RequestContextMutator>,
    private readonly cls: ClsService,
  ) {}
  @Get('nominal')
  @Auth.PublicTenantRoute()
  nominal() {
    return this.privacy.applyTenantRetention(true);
  }
  @Get('optional')
  @Auth.PublicTenantRoute({ optionalAuth: true })
  optional() {
    return this.privacy.applyTenantRetention(true);
  }
  @Get('system')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  system() {
    return this.database.withSystemContext('HTTP cannot become privacy admin', () =>
      this.privacy.applyRetention(true),
    );
  }
  @Get('reset-system')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  resetSystem() {
    return this.cls.runWith({}, () => this.system());
  }
  @Get('held')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  held() {
    return this.database.tx(() => this.privacy.applyTenantRetention(true), {
      role: 'app',
      requireActor: true,
      retry: false,
    });
  }
  @Get('hidden')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  hidden() {
    const snapshot = this.context.snapshot();
    return this.database.tx(
      () =>
        this.cls.runWith({}, () =>
          this.mutator.runWithRequestContext(snapshot, () =>
            this.privacy.applyTenantRetention(true),
          ),
        ),
      { role: 'app', requireActor: true, retry: false },
    );
  }
  @Get('retention-invalid-input')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  invalidRetentionInput() {
    // A malformed in-process caller is independent of the HTTP query parser.
    return this.privacy.applyTenantRetention('false' as unknown as boolean);
  }
  @Get('captured-export-authority/:fault')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  capturedExportAuthority(@Param('fault') fault: CapturedArgumentFault) {
    const { tenantId, actorId } = this.capturedArguments(fault);
    try {
      (this.privacy as unknown as CapturedPrivacyAuthority).requireExportAuthority(
        tenantId,
        actorId,
      );
      return { tenantId, actorId };
    } catch (error) {
      this.capturedAuthorityFailures.push(error);
      throw error;
    }
  }
  @Get('captured-transaction-authority/:fault')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  async capturedTransactionAuthority(@Param('fault') fault: CapturedArgumentFault) {
    const { tenantId, actorId } = this.capturedArguments(fault);
    try {
      return await (this.privacy as unknown as CapturedPrivacyAuthority).runTransaction(
        async (transaction) => {
          this.capturedTransactionCallbacks++;
          return (
            await transaction.query(
              "select current_user,session_user,current_setting('app.tenant_id',true) tenant,current_setting('app.actor_id',true) actor,current_setting('transaction_read_only') readonly",
            )
          ).rows[0];
        },
        tenantId,
        true,
        actorId,
      );
    } catch (error) {
      this.capturedAuthorityFailures.push(error);
      throw error;
    }
  }
  private capturedArguments(fault: CapturedArgumentFault) {
    const current = this.context.snapshot();
    if (fault !== 'tenant' && fault !== 'actor' && fault !== 'valid')
      throw new Error('Unsupported captured-argument test fault');
    if (!current.tenantId || !current.actorId)
      throw new Error('Missing actual authenticated test frame');
    // Preserve live proof/CLS. Only the arguments captured by the caller become stale.
    return {
      tenantId: fault === 'tenant' ? OTHER_TENANT : current.tenantId,
      actorId: fault === 'actor' ? OTHER_ACTOR : current.actorId,
    };
  }
  @Get('context-mismatch')
  @UseGuards(Auth.PermissionGuard)
  @Auth.Permission('privacy:read')
  mismatch() {
    this.mutator.patch({ tenantId: OTHER_TENANT });
    return this.privacy.applyTenantRetention(true);
  }
}

export class CapturingPrivacyStore implements PrivacyObjectStore {
  readonly objects = new Map<string, Buffer>();
  readonly calls: string[] = [];
  failure?: 'put' | 'presign';
  afterPut?: () => void | Promise<void>;
  afterPresign?: () => void | Promise<void>;
  async putObject(input: { key: string; body: Buffer; contentType: string; expiresAt?: Date }) {
    this.calls.push('put');
    if (this.failure === 'put') throw new Error('external object put failure');
    this.objects.set(input.key, Buffer.from(input.body));
    await this.afterPut?.();
  }
  async presignDownload(input: { key: string; expiresInSeconds: number }) {
    this.calls.push('presign');
    if (this.failure === 'presign') throw new Error('external signing failure');
    await this.afterPresign?.();
    return `memory://${input.key}?ttl=${input.expiresInSeconds}`;
  }
}

export class AuthenticatedPrivacyApp {
  readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly issuer = 'https://privacy-security.test';
  readonly sessions = new Sessions.InMemorySessionStore();
  readonly objectStore = new CapturingPrivacyStore();
  readonly disabledUsers: string[] = [];
  readonly appRoot = mkdtempSync(join(tmpdir(), 'privacy HTTP espaço '));
  postgres!: PostgresTestDatabase;
  app!: INestApplication;
  moduleRef!: TestingModule;
  database!: DatabaseType;
  privacy!: PrivacyServiceType;
  readonly observations: Record<string, unknown>[] = [];
  readonly queries: {
    sql: string;
    role: unknown;
    tenant: unknown;
    actor: unknown;
    current_user: unknown;
    session_user: unknown;
    readonly: unknown;
  }[] = [];
  afterBusinessQuery?: () => void | Promise<void>;
  afterSnapshotCommit?: () => void;
  readonly rules: PrivacyRule[] = [
    ...(['email', 'phone', 'note'] as const).map((columnName) => ({
      tableSchema: 'privacy_http',
      tableName: 'subjects',
      columnName,
      subjectColumn: 'user_id',
      tenantColumn: 'tenant_id',
      strategy:
        columnName === 'email'
          ? ('nullify' as const)
          : columnName === 'phone'
            ? ('hash_with_salt' as const)
            : ('tombstone' as const),
    })),
    {
      tableSchema: 'privacy_http',
      tableName: 'attachments',
      columnName: 'blob',
      subjectColumn: 'user_id',
      tenantColumn: 'tenant_id',
      strategy: 'delete_row',
      retention: {
        timestampColumn: 'created_at',
        olderThanDays: 30,
        target: 'both',
      },
    },
    {
      tableSchema: 'privacy_http',
      tableName: 'global_records',
      columnName: 'secret',
      subjectColumn: 'user_id',
      strategy: 'nullify',
    },
  ];
  writeRules(rules = this.rules) {
    mkdirSync(join(this.appRoot, 'app/privacy'), { recursive: true });
    writeFileSync(join(this.appRoot, 'app/privacy/pii-map.yaml'), stringify({ rules }));
  }
  async initialize() {
    this.writeRules();
    this.postgres = await createPostgresTestDatabase('stynx_privacy_security', {
      useTemplate: false,
    });
    const options = Sessions.resolveSessionsOptions({
      issuer: this.issuer,
      redis: { url: 'redis://unused.test:6379' },
      jwt: {
        keySet: {
          currentKid: 'privacy-test',
          keys: [
            {
              kid: 'privacy-test',
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
        Data.StynxDataModule.forRoot({
          connections: {
            owner: {
              connectionString: this.postgres.connectionString('privacy-owner'),
            },
            app: {
              connectionString: this.postgres.appConnectionString('privacy-app'),
            },
            reader: {
              connectionString: this.postgres.appConnectionString('privacy-reader', 'stynx_reader'),
            },
          },
          migrations: { enabled: true },
          retry: false,
        }),
        Auth.StynxAuthModule.forRoot({ stynx: { issuer: this.issuer } }),
        Tenancy.StynxTenancyModule.forRoot({
          headerName: 'X-Tenant-Id',
          publicTenant: { actorId: ACTOR, resolveHost: () => TENANT },
        }),
        Privacy.StynxPrivacyModule.forRoot({
          appRoot: this.appRoot,
          environment: 'test',
          region: 'us-east-1',
          erasureSalt: SALT,
          objectStore: this.objectStore,
          cognitoAdmin: {
            disableUser: async (id: string) => {
              this.disabledUsers.push(id);
            },
          },
        }),
      ],
      controllers: [PrivacyBoundaryController],
      providers: [
        { provide: Sessions.STYNX_SESSIONS_OPTIONS, useValue: options },
        { provide: Sessions.STYNX_SESSION_STORE, useValue: this.sessions },
        {
          provide: Sessions.STYNX_SESSION_MIRROR,
          useClass: Sessions.SessionMirrorWriter,
        },
        Sessions.SessionJwtSigningService,
        Sessions.SessionService,
      ],
    }).compile();
    this.app = this.moduleRef.createNestApplication();
    await this.app.init();
    await this.postgres.ensureRoleLogin('stynx_app');
    await this.postgres.ensureRoleLogin('stynx_reader');
    this.database = this.moduleRef.get(Data.Database);
    this.privacy = this.moduleRef.get(Privacy.PrivacyService);
    const admin = await this.adminClient();
    try {
      for (const [id, slug] of [
        [TENANT, 'privacy-a'],
        [OTHER_TENANT, 'privacy-b'],
      ])
        await admin.query('insert into tenancy.tenants(id,slug,name) values($1,$2,$2)', [id, slug]);
      for (const [id, name] of [
        [ACTOR, 'writer'],
        [READER, 'reader'],
        [DENIED, 'denied'],
        [OTHER_ACTOR, 'other'],
        [SUBJECT, 'subject'],
        [FOREIGN_SUBJECT, 'foreign'],
        [INACTIVE_SUBJECT, 'inactive'],
      ])
        await admin.query('insert into auth.users(id,email) values($1,$2)', [
          id,
          `${name}@privacy.test`,
        ]);
      for (const [tenant, user, active] of [
        [TENANT, ACTOR, true],
        [TENANT, READER, true],
        [TENANT, DENIED, true],
        [OTHER_TENANT, OTHER_ACTOR, true],
        [TENANT, SUBJECT, true],
        [OTHER_TENANT, SUBJECT, true],
        [OTHER_TENANT, FOREIGN_SUBJECT, true],
        [TENANT, INACTIVE_SUBJECT, false],
      ])
        await admin.query(
          'insert into auth.memberships(tenant_id,user_id,is_active) values($1,$2,$3)',
          [tenant, user, active],
        );
      await admin.query(
        "insert into auth.perms(key,description) values('privacy:read','Read privacy'),('privacy:subject-rights','Subject rights') on conflict(key) do nothing",
      );
      await admin.query(
        "insert into auth.direct_perms(membership_id,perm_id,effect) select m.id,p.id,'allow' from auth.memberships m cross join auth.perms p where (m.user_id in ($1,$3) and p.key in ('privacy:read','privacy:subject-rights')) or (m.user_id=$2 and p.key='privacy:read')",
        [ACTOR, READER, OTHER_ACTOR],
      );
      await admin.query('create schema privacy_http authorization stynx_owner');
      await admin.query(
        'create table privacy_http.subjects (tenant_id uuid not null,user_id uuid not null,email text,phone text,note text, amount integer not null default -42, created_at timestamptz not null default now(),"=column" text not null default \'=1\',primary key(tenant_id,user_id))',
      );
      await admin.query(
        'create table privacy_http.attachments (tenant_id uuid not null,user_id uuid not null,blob text,created_at timestamptz not null default now(),primary key(tenant_id,user_id))',
      );
      await admin.query(
        'create table privacy_http.global_records(user_id uuid primary key,secret text)',
      );
      await admin.query(
        'create table archive.privacy_http_subjects (like privacy_http.subjects including all, last_erasure_at timestamptz)',
      );
      await admin.query(
        'create table archive.privacy_http_attachments (like privacy_http.attachments including all)',
      );
      await admin.query(
        'create table archive.privacy_http_global_records (like privacy_http.global_records including all)',
      );
      for (const table of [
        'privacy_http.subjects',
        'privacy_http.attachments',
        'archive.privacy_http_subjects',
        'archive.privacy_http_attachments',
      ]) {
        await admin.query(`alter table ${table} owner to stynx_owner`);
        await admin.query(`alter table ${table} enable row level security`);
        await admin.query(`alter table ${table} force row level security`);
        await admin.query(
          `create policy tenant on ${table} using (tenant_id=current_setting('app.tenant_id',true)::uuid) with check (tenant_id=current_setting('app.tenant_id',true)::uuid)`,
        );
        await admin.query(`grant select on ${table} to stynx_reader`);
        await admin.query(`grant select,update,delete on ${table} to stynx_app`);
      }
      await admin.query('grant usage on schema privacy_http to stynx_reader,stynx_app');
      for (const tenant of [TENANT, OTHER_TENANT])
        for (const table of ['privacy_http.subjects', 'archive.privacy_http_subjects'])
          await admin.query(
            `insert into ${table}(tenant_id,user_id,email,phone,note) values($1,$2,$3,$4,$5)`,
            [
              tenant,
              SUBJECT,
              `${tenant}@privacy.test`,
              '+5511999990000',
              ' \u0085=HYPERLINK("bad")',
            ],
          );
      for (const tenant of [TENANT, OTHER_TENANT])
        for (const table of ['privacy_http.attachments', 'archive.privacy_http_attachments'])
          await admin.query(
            `insert into ${table}(tenant_id,user_id,blob,created_at) values($1,$2,$3,now()-interval '60 days')`,
            [tenant, SUBJECT, `blob-${tenant}`],
          );
      await admin.query(
        "insert into privacy_http.global_records(user_id,secret) values($1,'global secret')",
        [SUBJECT],
      );
      await admin.query(
        "insert into archive.privacy_http_global_records(user_id,secret) values($1,'archived global secret')",
        [SUBJECT],
      );
    } finally {
      await admin.end();
    }
    for (const [sid, userId, tenantId] of [
      ['writer', ACTOR, TENANT],
      ['reader', READER, TENANT],
      ['denied', DENIED, TENANT],
      ['other', ACTOR, OTHER_TENANT],
      ['otherWriter', OTHER_ACTOR, OTHER_TENANT],
    ]) {
      const now = new Date().toISOString(),
        future = new Date(Date.now() + 3600000).toISOString();
      await this.sessions.createSession({
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
    for (const method of ['tx', 'txIndependent'] as const) {
      const original = this.database[method].bind(this.database);
      vi.spyOn(this.database, method).mockImplementation((async (
        fn: (trx: Transaction) => Promise<unknown>,
        options?: Parameters<DatabaseType['tx']>[1],
      ) => {
        let business = false;
        const result = await original(async (trx) => {
          const identity = await trx.query(
            "select current_user,session_user,current_setting('app.tenant_id',true) tenant,current_setting('app.actor_id',true) actor,current_setting('transaction_read_only') readonly",
          );
          this.observations.push({
            ...identity.rows[0],
            requestedRole: options?.role,
          });
          const originalQuery = trx.query;
          trx.query = (async (...args: Parameters<Transaction['query']>) => {
            if (typeof args[0] === 'string' && args[0].includes('"privacy_http"."subjects"'))
              business = true;
            if (typeof args[0] === 'string')
              this.queries.push({
                ...identity.rows[0],
                sql: args[0],
                role: options?.role,
                tenant: identity.rows[0]?.tenant,
                actor: identity.rows[0]?.actor,
              });
            const result = await originalQuery.apply(trx, args);
            if (
              typeof args[0] === 'string' &&
              args[0].includes('"privacy_http"."subjects"') &&
              this.afterBusinessQuery
            )
              await this.afterBusinessQuery();
            return result;
          }) as Transaction['query'];
          try {
            return await fn(trx);
          } finally {
            trx.query = originalQuery;
          }
        }, options);
        if (business && options?.readonly) this.afterSnapshotCommit?.();
        return result;
      }) as DatabaseType['tx']);
    }
  }
  token(
    kind: 'writer' | 'reader' | 'denied' | 'other' | 'otherWriter' = 'writer',
    override: { exp?: number; sid?: string } = {},
  ) {
    const sub =
      kind === 'reader'
        ? READER
        : kind === 'denied'
          ? DENIED
          : kind === 'otherWriter'
            ? OTHER_ACTOR
            : ACTOR;
    const body = {
      iss: this.issuer,
      sub,
      sid: override.sid ?? kind,
      tenant_id: kind === 'other' || kind === 'otherWriter' ? OTHER_TENANT : TENANT,
      exp: override.exp ?? Math.floor(Date.now() / 1000) + 3600,
    };
    const input =
      Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'privacy-test', typ: 'JWT' })).toString(
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
  headers(
    kind: 'writer' | 'reader' | 'denied' | 'other' | 'otherWriter' = 'writer',
    tenant = TENANT,
  ) {
    return {
      authorization: `Bearer ${this.token(kind)}`,
      'x-tenant-id': tenant,
    };
  }
  async adminClient() {
    return this.postgres.connectAsAdmin();
  }
  async snapshot() {
    const admin = await this.adminClient();
    try {
      const result: Record<string, unknown> = {};
      for (const table of [
        'privacy_http.subjects',
        'archive.privacy_http_subjects',
        'privacy_http.attachments',
        'archive.privacy_http_attachments',
        'privacy_http.global_records',
        'archive.privacy_http_global_records',
        'auth.users',
        'auth.memberships',
      ])
        result[table] = (
          await admin.query(
            `select row_to_json(t) value from ${table} t order by row_to_json(t)::text`,
          )
        ).rows;
      return result;
    } finally {
      await admin.end();
    }
  }
  async resetRows() {
    const admin = await this.adminClient();
    try {
      for (const table of [
        'privacy_http.subjects',
        'archive.privacy_http_subjects',
        'privacy_http.attachments',
        'archive.privacy_http_attachments',
      ])
        await admin.query(`truncate ${table}`);
      for (const tenant of [TENANT, OTHER_TENANT]) {
        for (const table of ['privacy_http.subjects', 'archive.privacy_http_subjects'])
          await admin.query(
            `insert into ${table}(tenant_id,user_id,email,phone,note) values($1,$2,$3,$4,$5)`,
            [
              tenant,
              SUBJECT,
              `${tenant}@privacy.test`,
              '+5511999990000',
              ' \u0085=HYPERLINK("bad")',
            ],
          );
        for (const table of ['privacy_http.attachments', 'archive.privacy_http_attachments'])
          await admin.query(
            `insert into ${table}(tenant_id,user_id,blob,created_at) values($1,$2,$3,now()-interval '60 days')`,
            [tenant, SUBJECT, `blob-${tenant}`],
          );
      }
    } finally {
      await admin.end();
    }
  }
  async createRevokedSession() {
    const record = (await this.sessions.getSession('writer'))!;
    await this.sessions.createSession({
      ...record,
      sid: 'revoked',
      refreshTokenHash: 'revoked',
      refreshFamilyId: 'revoked',
      status: 'revoked',
      revokedAt: new Date().toISOString(),
    });
  }
  resetObservations() {
    this.observations.length = 0;
    this.queries.length = 0;
    this.objectStore.calls.length = 0;
  }
  async poolIdentities() {
    const registry = this.moduleRef.get(Data.StynxPoolRegistry);
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
  runInternal<T>(job: () => Promise<T>) {
    return this.database.withSystemContext('explicit independent privacy internal job', job);
  }
  runPrivateFrame<T>(job: () => Promise<T>) {
    return this.database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, job);
  }
  mutateContext(patch: { tenantId?: string; actorId?: string } = { tenantId: OTHER_TENANT }) {
    this.moduleRef.get(Core.RequestContextMutator).patch(patch);
  }
  async teardown() {
    await this.app?.close();
    await this.postgres?.dispose();
    rmSync(this.appRoot, { recursive: true, force: true });
  }
}
