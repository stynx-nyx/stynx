import 'reflect-metadata';
import assert from 'node:assert/strict';
import { realpathSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import supertest from 'supertest';
import {
  CatalogService,
  LocaleService,
  LocaleInterceptor,
  I18nAdminService,
} from '@stynx-nyx/i18n';
import { RequestContext, generateRequestId } from '@stynx-nyx/core';
import {
  InvalidCredentialError,
  STYNX_RESOLVED_TENANT_COMMAND_CONTEXT,
  STYNX_VERIFIED_TENANT_ID,
  type ResolvedTenantCommandContextPort,
} from '@stynx-nyx/contracts';
import {
  TenantContextInterceptor,
  STYNX_TENANT_MEMBERSHIP_CACHE,
  type MembershipAccessCache,
} from '@stynx-nyx/tenancy';
import { IndependentTransactionConnectionError } from '@stynx-nyx/data';
import { StynxJwtValidator } from '@stynx-nyx/auth';
import {
  AuthenticatedI18nApp,
  TENANT_ID as A,
  OTHER_TENANT_ID as B,
  ACTOR_ID,
} from './authenticated-app';

// Every STYNX client sends its own UUIDv7 X-Request-Id; STYNX rejects a
// missing one (SM-15). This wraps supertest so each request carries a fresh id.
const REQUEST_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
function request(app: Parameters<typeof supertest>[0]) {
  const agent = supertest(app);
  return new Proxy(agent, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (
        typeof property === 'string' &&
        REQUEST_METHODS.has(property) &&
        typeof value === 'function'
      ) {
        return (...args: unknown[]) =>
          (value as (...input: unknown[]) => supertest.Test)
            .apply(target, args)
            .set('X-Request-Id', generateRequestId());
      }
      return value;
    },
  });
}

const observations: { name: string; status: 'PASS' }[] = [];
async function witness(name: string, fn: () => Promise<void> | void) {
  await fn();
  observations.push({ name, status: 'PASS' });
  console.log(`I18N_INSTALLED_WITNESS ${name} PASS`);
}
const fixture = new AuthenticatedI18nApp([], process.cwd());
const headers = (
  kind: 'writer' | 'reader' | 'denied' | 'other' | 'otherWriter' = 'writer',
  tenant = kind === 'otherWriter' ? B : A,
) => ({ 'x-tenant-id': tenant, authorization: `Bearer ${fixture.token(kind)}` });
async function main() {
  await fixture.initialize();
  try {
    const catalog = fixture.moduleRef.get(CatalogService),
      locale = fixture.moduleRef.get(LocaleService),
      admin = fixture.moduleRef.get(I18nAdminService);
    const internal = <T>(tenantId: string | undefined, actorId: string | undefined, fn: () => T) =>
      fixture.requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          startedAt: new Date(),
          ...(tenantId ? { tenantId } : {}),
          ...(actorId ? { actorId } : {}),
        },
        fn,
      );
    const http = request(fixture.app.getHttpServer());
    await witness('installed-runtime-realpaths', () => {
      const root = realpathSync(resolve(process.cwd(), 'node_modules')) + sep;
      for (const name of [
        'contracts',
        'core',
        'data',
        'idempotency',
        'sessions',
        'auth',
        'i18n',
        'tenancy',
      ])
        assert.ok(realpathSync(require.resolve('@stynx-nyx/' + name)).startsWith(root));
      const fromAuth = createRequire(require.resolve('@stynx-nyx/auth'))('@stynx-nyx/contracts');
      assert.equal(fromAuth.InvalidCredentialError, InvalidCredentialError);
      const fromConsumer = createRequire(__filename);
      assert.equal(fromConsumer('intl-messageformat').default.name, 'IntlMessageFormat');
    });
    await witness('real-ICU-plurals-interpolation-Unicode-fallback', () => {
      assert.equal(catalog.translate('ITEM_COUNT', 'pt-BR', { count: 1 }), '1 item');
      assert.equal(catalog.translate('ITEM_COUNT', 'pt-BR', { count: 2 }), '2 itens');
      assert.equal(catalog.translate('GREETING', 'pt-BR', { name: 'João' }), 'Olá, João!');
      assert.equal(catalog.translate('EN_ONLY', 'pt-BR'), 'English fallback');
      assert.equal(catalog.translate('GREETING', 'fr-FR', { name: 'Zoë' }), 'Hello, Zoë!');
      assert.equal(catalog.translate('MISSING', 'pt-BR'), 'MISSING');
    });
    await witness('real-validator-malformed-signature-error-class', async () => {
      const validator = fixture.moduleRef.get(StynxJwtValidator);
      await assert.rejects(
        validator.validate('not.a.jwt'),
        (error) => error instanceof InvalidCredentialError,
      );
      const token = fixture.token();
      const parts = token.split('.');
      parts[2] = Buffer.alloc(256).toString('base64url');
      await assert.rejects(
        validator.validate(parts.join('.')),
        (error) => error instanceof InvalidCredentialError,
      );
    });
    await witness('packed-platform-migrations-and-direct-restricted-pools', async () => {
      assert.deepEqual(await fixture.poolIdentities(), [
        {
          current_user: 'stynx_app',
          session_user: 'stynx_app',
          rolsuper: false,
          rolbypassrls: false,
        },
        {
          current_user: 'stynx_reader',
          session_user: 'stynx_reader',
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
      const client = await fixture.adminClient();
      try {
        const files = readdirSync(
          resolve(dirname(require.resolve('@stynx-nyx/data')), '../../../migrations/platform'),
        )
          .filter((name) => name.endsWith('.sql'))
          .sort();
        assert.deepEqual(
          (await client.query('select id from core.schema_migrations order by id')).rows.map(
            (row) => row.id,
          ),
          files,
        );
        assert.equal(
          (
            await client.query(
              "select relrowsecurity,relforcerowsecurity from pg_class where oid='tenancy.tenant_settings'::regclass",
            )
          ).rows[0].relforcerowsecurity,
          true,
        );
      } finally {
        await client.end();
      }
    });
    await witness('protected-HTTP-auth-permissions-and-membership', async () => {
      await http.get('/_tenancy/i18n/overrides').expect(401);
      await http
        .get('/_tenancy/i18n/overrides')
        .set({ 'x-tenant-id': A, authorization: 'Bearer malformed' })
        .expect(401);
      await http.get('/_tenancy/i18n/overrides').set(headers('denied')).expect(403);
      await http.get('/_tenancy/i18n/overrides').set(headers('other', B)).expect(403);
      await http.get('/_tenancy/i18n/overrides').set(headers('reader')).expect(200);
      await http
        .put('/_tenancy/i18n/overrides')
        .set(headers('reader'))
        .send({ locale: 'pt-BR', catalog: { title: 'Forbidden' } })
        .expect(403);
    });
    await witness(
      'actual-request-reader-app-identities-no-owner-and-committed-isolation',
      async () => {
        fixture.observations.length = 0;
        const read = await http.get('/_tenancy/i18n/overrides').set(headers()).expect(200);
        assert.equal(read.body['i18n.override.pt-BR.title'], 'Titulo');
        await http
          .put('/_tenancy/i18n/overrides')
          .set(headers())
          .send({ locale: 'pt-BR', catalog: { title: 'Tenant A committed' } })
          .expect(200);
        await http
          .put('/_tenancy/i18n/overrides')
          .set(headers('otherWriter'))
          .send({ locale: 'pt-BR', catalog: { title: 'Tenant B committed' } })
          .expect(200);
        assert.ok(
          fixture.observations.some(
            (row) =>
              row.current_user === 'stynx_reader' &&
              row.session_user === 'stynx_reader' &&
              row.tenant === A &&
              row.actor === ACTOR_ID &&
              row.readonly === 'on',
          ),
        );
        assert.ok(
          fixture.observations.some(
            (row) =>
              row.current_user === 'stynx_app' &&
              row.session_user === 'stynx_app' &&
              row.tenant === A &&
              row.actor === ACTOR_ID &&
              row.readonly === 'off',
          ),
        );
        assert.ok(
          fixture.observations.every(
            (row) => row.requestedRole !== 'owner' && row.current_user !== 'stynx_owner',
          ),
          JSON.stringify({
            observations: fixture.observations,
            settingsQueries: fixture.settingsQueries,
            ownerQueries: fixture.businessQueries.filter(
              (row) => row.current_user === 'stynx_owner',
            ),
          }),
        );
        const client = await fixture.adminClient();
        try {
          const rows = (
            await client.query(
              'select tenant_id,settings from tenancy.tenant_settings order by tenant_id',
            )
          ).rows;
          assert.equal(
            rows.find((row) => row.tenant_id === A).settings['i18n.override.pt-BR.title'],
            'Tenant A committed',
          );
          assert.equal(
            rows.find((row) => row.tenant_id === B).settings['i18n.override.pt-BR.title'],
            'Tenant B committed',
          );
          assert.equal(rows.find((row) => row.tenant_id === A).settings.existing, true);
        } finally {
          await client.end();
        }
      },
    );
    await witness('verified-nominal-protected-origin-and-concurrent-localized-errors', async () => {
      fixture.settingsQueries.length = 0;
      const nominal = await http.get('/_i18n-public/nominal').expect(200);
      assert.equal(nominal.body.mode, 'nominal');
      assert.equal(nominal.body.translated, 'Global title');
      assert.equal(fixture.settingsQueries.length, 0);
      const verified = await http.get('/_i18n-public/optional').set(headers()).expect(200);
      assert.equal(verified.body.mode, 'verified');
      assert.equal(verified.body.translated, 'Tenant A committed');
      const protectedResponse = await http
        .get('/_i18n-public/protected')
        .set(headers())
        .expect(200);
      assert.equal(protectedResponse.body.mode, 'protected');
      assert.equal(protectedResponse.body.translated, 'Tenant A committed');
      const [left, right] = await Promise.all([
        http.get('/_i18n-public/concurrent-error').set(headers()).expect(400),
        http.get('/_i18n-public/concurrent-error').set(headers('otherWriter')).expect(400),
      ]);
      assert.equal(left.body.message, 'Tenant A committed');
      assert.equal(right.body.message, 'Tenant B committed');
      const error = await http.get('/_i18n-public/error').expect(400);
      assert.equal(error.body.message, 'Global title');
    });
    await witness('manual-one-argument-constructor-lazy-observable-and-teardown', async () => {
      await internal(A, ACTOR_ID, async () => {
        assert.equal(locale.t('title'), 'Tenant A committed');
        const before = fixture.settingsQueries.length;
        const interceptor = new LocaleInterceptor(locale);
        const context = {
          switchToHttp: () => ({ getRequest: () => ({ headers: { 'accept-language': 'pt-BR' } }) }),
        } as unknown as ExecutionContext;
        let handled = 0;
        const output = interceptor.intercept(context, {
          handle: () => {
            handled += 1;
            return of(locale.t('title'));
          },
        });
        assert.equal(handled, 0);
        assert.equal(await lastValueFrom(output), 'Global title');
        assert.equal(handled, 1);
        assert.equal(fixture.settingsQueries.length, before);
        assert.equal(locale.t('title'), 'Tenant A committed');
      });
    });
    await witness('warm-cache-missing-actor-tenant-mismatch-refuse-before-SQL', async () => {
      const before = fixture.observations.length;
      await internal(A, undefined, async () => {
        await assert.rejects(admin.listTenantOverrides(A));
        assert.throws(() => catalog.translate('title', 'pt-BR', {}, A));
      });
      await internal(B, ACTOR_ID, async () => {
        await assert.rejects(
          admin.updateTenantOverrides(A, { locale: 'pt-BR', catalog: { title: 'Wrong' } }),
        );
        assert.throws(() => catalog.setTenantOverrides(A, {}));
      });
      assert.equal(fixture.observations.length, before);
    });
    await witness('held-nested-and-hidden-connection-refuse-without-publication', async () => {
      await internal(A, ACTOR_ID, async () => {
        assert.equal(locale.t('title'), 'Tenant A committed');
        const rollback = new Error('owned outer rollback');
        await assert.rejects(
          fixture.database.tx(async (trx) => {
            await trx.query(
              "update tenancy.tenant_settings set settings=jsonb_set(settings,'{i18n.override.pt-BR.title}',to_jsonb('Uncommitted outer value'::text)) where tenant_id=$1::uuid",
              [A],
            );
            await assert.rejects(
              admin.updateTenantOverrides(A, {
                locale: 'pt-BR',
                catalog: { title: 'Rolled back' },
              }),
            );
            await fixture.database.tx(async () => {
              await assert.rejects(admin.listTenantOverrides(A));
            });
            await internal(A, ACTOR_ID, async () => {
              await assert.rejects(catalog.tenantOverrides(A));
            });
            throw rollback;
          }),
          (error) => error === rollback,
        );
        assert.equal(locale.t('title'), 'Tenant A committed');
        assert.equal(
          (await admin.listTenantOverrides(A))['i18n.override.pt-BR.title'],
          'Tenant A committed',
        );
      });
    });
    await witness(
      'real-tenancy-admission-refuses-held-and-hidden-connections-without-proof',
      async () => {
        const interceptor = fixture.moduleRef.get(TenantContextInterceptor);
        const proof = fixture.moduleRef.get<ResolvedTenantCommandContextPort>(
          STYNX_RESOLVED_TENANT_COMMAND_CONTEXT,
          { strict: false },
        );
        const createAdmission = (tenant: string) => {
          const req = {
            headers: { 'x-tenant-id': tenant },
            originalUrl: '/records',
            principal: { id: ACTOR_ID },
          };
          Reflect.set(req, STYNX_VERIFIED_TENANT_ID, tenant);
          const context = {
            switchToHttp: () => ({ getRequest: () => req }),
            getHandler: () => () => undefined,
            getClass: () => class Admission {},
          } as unknown as ExecutionContext;
          return { req, context };
        };
        const cache = fixture.moduleRef.get<MembershipAccessCache>(STYNX_TENANT_MEMBERSHIP_CACHE, {
          strict: false,
        });
        const admitControl = async () => {
          const { req, context } = createAdmission(A);
          assert.equal(
            await lastValueFrom(
              interceptor.intercept(context, {
                handle: () => of('admitted-control'),
              } as CallHandler),
            ),
            'admitted-control',
          );
          assert.equal(req.headers['x-tenant-id'], A);
          assert.deepEqual(proof.get(req), { tenantId: A, actorId: ACTOR_ID, mode: 'protected' });
        };
        const runAdmission = async (tenant = B) => {
          const { req, context } = createAdmission(tenant);
          assert.equal(req.headers['x-tenant-id'], tenant);
          let handled = false;
          await assert.rejects(
            lastValueFrom(
              interceptor.intercept(context, {
                handle: () => {
                  handled = true;
                  return of('unexpected');
                },
              } as CallHandler),
            ),
            (error) => error instanceof IndependentTransactionConnectionError,
          );
          assert.equal(handled, false);
          assert.equal(proof.get(req), undefined);
          assert.equal(Object.hasOwn(req, 'tenantId'), false);
        };
        await internal(A, ACTOR_ID, async () => {
          const before = fixture.moduleRef.get(RequestContext).snapshot();
          cache.invalidateTenant(A);
          assert.equal(cache.get(ACTOR_ID, A), undefined);
          const beforeMiss = fixture.businessQueries.length;
          await admitControl();
          const membershipReads = fixture.businessQueries
            .slice(beforeMiss)
            .filter((row) => typeof row.sql === 'string' && row.sql.includes('auth.memberships'));
          assert.equal(membershipReads.length, 1);
          assert.equal(membershipReads[0].tenant, A);
          assert.equal(membershipReads[0].actor, ACTOR_ID);
          assert.equal(membershipReads[0].current_user, 'stynx_reader');
          assert.equal(membershipReads[0].session_user, 'stynx_reader');
          assert.equal(membershipReads[0].readonly, 'on');
          assert.equal(cache.get(ACTOR_ID, A), true);
          const beforeHit = fixture.businessQueries.length;
          await admitControl();
          assert.equal(fixture.businessQueries.length, beforeHit);
          assert.equal(cache.get(ACTOR_ID, A), true);
          await fixture.database.tx(async () => {
            await runAdmission();
            await internal(A, ACTOR_ID, () => runAdmission());
            await runAdmission(A);
            await internal(A, ACTOR_ID, () => runAdmission(A));
          });
          assert.deepEqual(fixture.moduleRef.get(RequestContext).snapshot(), before);
          assert.equal(cache.get(ACTOR_ID, A), true);
        });
      },
    );
    await witness(
      'deferred-real-commit-failure-preserves-committed-cache-and-settings',
      async () => {
        const client = await fixture.adminClient();
        try {
          await client.query(
            `create function tenancy.installed_refuse_commit() returns trigger language plpgsql as $$ begin raise exception 'owned deferred commit refusal'; end $$`,
          );
          await client.query(
            `create constraint trigger installed_refuse_commit after update on tenancy.tenant_settings deferrable initially deferred for each row when (NEW.settings->>'i18n.override.pt-BR.title'='Commit must fail') execute function tenancy.installed_refuse_commit()`,
          );
          await internal(A, ACTOR_ID, async () => {
            assert.equal(locale.t('title'), 'Tenant A committed');
            await assert.rejects(
              admin.updateTenantOverrides(A, {
                locale: 'pt-BR',
                catalog: { title: 'Commit must fail' },
              }),
            );
            assert.equal(locale.t('title'), 'Tenant A committed');
            assert.equal(
              (await admin.listTenantOverrides(A))['i18n.override.pt-BR.title'],
              'Tenant A committed',
            );
          });
          assert.equal(
            (
              await client.query(
                'select settings from tenancy.tenant_settings where tenant_id=$1::uuid',
                [A],
              )
            ).rows[0].settings['i18n.override.pt-BR.title'],
            'Tenant A committed',
          );
        } finally {
          await client.query(
            'drop trigger if exists installed_refuse_commit on tenancy.tenant_settings',
          );
          await client.query('drop function if exists tenancy.installed_refuse_commit()');
          await client.end();
        }
      },
    );
    await witness(
      'explicit-system-internal-owner-only-and-tenant-APIs-remain-restricted',
      async () => {
        await assert.rejects(admin.listOverrides(A));
        await fixture.database.withSystemContext(
          'installed acceptance explicit owner',
          async () => {
            assert.equal(
              (await admin.listOverrides(A))['i18n.override.pt-BR.title'],
              'Tenant A committed',
            );
            await admin.updateOverrides(A, {
              locale: 'pt-BR',
              catalog: { internal: 'Owner compatibility' },
            });
          },
        );
        await fixture.database.withSystemContext(
          'installed acceptance tenant under System',
          async () => {
            fixture.requestContextMutator.patch({ tenantId: A, actorId: ACTOR_ID });
            fixture.observations.length = 0;
            await admin.listTenantOverrides(A);
            await admin.updateTenantOverrides(A, {
              locale: 'pt-BR',
              catalog: { restricted: 'Restricted' },
            });
            assert.ok(fixture.observations.every((row) => row.requestedRole !== 'owner'));
          },
        );
        const before = fixture.observations.length;
        await internal(B, ACTOR_ID, () =>
          fixture.database.withSystemContext('mismatched system', async () => {
            fixture.requestContextMutator.patch({ tenantId: B, actorId: ACTOR_ID });
            await assert.rejects(
              admin.updateOverrides(A, { locale: 'pt-BR', catalog: { title: 'Wrong owner' } }),
            );
          }),
        );
        assert.equal(fixture.observations.length, before);
        const system = await http.get('/_i18n-public/system').set(headers()).expect(403);
        assert.equal(
          system.body.message,
          'I18n internal administration is unavailable to HTTP requests',
        );
        const reset = await http.get('/_i18n-public/system-reset').set(headers()).expect(403);
        assert.equal(
          reset.body.message,
          'I18n internal administration is unavailable to HTTP requests',
        );
      },
    );
    await witness('genuine-owned-PostgreSQL-infrastructure-fault-is-not-invalid-auth', async () => {
      const client = await fixture.adminClient();
      try {
        await client.query(
          'alter table tenancy.tenant_settings rename to installed_fault_settings',
        );
        await http.get('/_tenancy/i18n/overrides').set(headers()).expect(500);
      } finally {
        await client.query(
          'alter table tenancy.installed_fault_settings rename to tenant_settings',
        );
        await client.end();
      }
      await http.get('/_tenancy/i18n/overrides').set(headers()).expect(200);
    });
    writeFileSync(
      'runtime-witnesses.json',
      JSON.stringify(
        {
          witnesses: observations,
          sessionStore: 'actual InMemorySessionStore; no Redis acceptance',
          infrastructureFault:
            'owned fixture PostgreSQL table temporarily unavailable; no shared service stopped',
        },
        null,
        2,
      ),
    );
    console.log('I18N_INSTALLED_RUNTIME_PASS');
  } finally {
    await fixture.teardown();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
