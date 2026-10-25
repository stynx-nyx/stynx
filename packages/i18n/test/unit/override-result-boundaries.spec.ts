import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { Database, type Transaction, type StynxDataRole } from '@stynx-nyx/data';
import { createFakeTransaction } from '@stynx-nyx/testing';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogService } from '../../src/catalog.service.js';
import { I18nAdminService } from '../../src/i18n-admin.service.js';
import type { I18nTenantOverrides } from '../../src/types.js';

// This file exercises the installed formatter, including native AST and errors.
vi.mock('intl-messageformat', async () => {
  const { createRequire } = await import('node:module');
  return import(/* @vite-ignore */ createRequire(import.meta.url).resolve('intl-messageformat'));
});
const TENANT = '00000000-0000-4000-8000-000000000001';
const initial = {
  'i18n.override.en-US.plain': 'old string',
  'i18n.override.en-US.rich': { nested: [true, 7, null, 'text'] },
  unrelated: { retained: true },
};
async function fixture() {
  const events: string[] = [];
  const transactions: ReturnType<typeof createFakeTransaction>[] = [];
  const context = { hasActiveContext: () => true, tenantId: TENANT, actorId: 'actor' };
  const database = {
    async txIndependent(
      fn: (trx: Transaction) => Promise<unknown>,
      options: { role: StynxDataRole },
    ) {
      const fake = createFakeTransaction(
        [
          { rows: [{ settings: initial }], rowCount: 1 },
          { rows: [], rowCount: 0 },
        ],
        options,
      );
      transactions.push(fake);
      events.push('transaction-start');
      try {
        const result = await fn(fake.transaction);
        events.push('transaction-end');
        return result;
      } finally {
        fake.transaction.close();
      }
    },
  };
  const module = await Test.createTestingModule({
    providers: [
      { provide: RequestContext, useValue: context },
      { provide: Database, useValue: database },
      { provide: SystemContext, useValue: { current: () => ({ reason: 'bounded native unit' }) } },
    ],
  }).compile();
  const moduleRef = module.get(ModuleRef);
  class ObservedCatalog extends CatalogService {
    received: I18nTenantOverrides[] = [];
    override setTenantOverrides(tenant: string, overrides: I18nTenantOverrides): void {
      events.push('cache-write');
      this.received.push(overrides);
      super.setTenantOverrides(tenant, overrides);
    }
  }
  const catalog = new ObservedCatalog(moduleRef, {});
  return {
    module,
    moduleRef,
    catalog,
    admin: new I18nAdminService(moduleRef, catalog),
    context,
    events,
    transactions,
  };
}

it('preserves recursive JSON through all five result paths and string updates without losing unrelated settings', async () => {
  const f = await fixture();
  try {
    const expected = {
      'i18n.override.en-US.plain': 'old string',
      'i18n.override.en-US.rich': initial['i18n.override.en-US.rich'],
    };
    expect(await f.catalog.tenantOverrides(TENANT)).toEqual(expected);
    expect(await f.admin.listOverrides(TENANT)).toEqual(expected);
    expect(await f.admin.listTenantOverrides(TENANT)).toEqual(expected);
    const changed = { ...expected, 'i18n.override.en-US.plain': 'updated' };
    expect(
      await f.admin.updateOverrides(TENANT, { locale: 'en-US', catalog: { plain: 'updated' } }),
    ).toEqual(changed);
    expect(
      await f.admin.updateTenantOverrides(TENANT, {
        locale: 'en-US',
        catalog: { plain: 'updated' },
      }),
    ).toEqual(changed);
    expect(f.catalog.received).toEqual([changed, changed]);
    for (const transaction of f.transactions.slice(3)) {
      expect(transaction.queries[1]).toEqual({
        text: expect.stringContaining('insert into tenancy.tenant_settings'),
        values: [TENANT, JSON.stringify({ ...initial, 'i18n.override.en-US.plain': 'updated' })],
      });
    }
    expect(f.events).toEqual([
      'transaction-start',
      'transaction-end',
      'transaction-start',
      'transaction-end',
      'transaction-start',
      'transaction-end',
      'transaction-start',
      'transaction-end',
      'cache-write',
      'transaction-start',
      'transaction-end',
      'cache-write',
    ]);
  } finally {
    await f.module.close();
  }
});
it('preserves virtual priming, cache copy getter receiver and context-before-read ordering', async () => {
  const f = await fixture();
  try {
    await f.catalog.primeTenantOverrides(TENANT);
    expect(f.catalog.received).toEqual([
      {
        'i18n.override.en-US.plain': 'old string',
        'i18n.override.en-US.rich': initial['i18n.override.en-US.rich'],
      },
    ]);
    const calls: string[] = [];
    const overrides = {
      get 'i18n.override.en-US.plain'() {
        expect(this).toBe(overrides);
        calls.push('plain');
        return 'cache value';
      },
    };
    f.catalog.setTenantOverrides(TENANT, overrides);
    expect(calls).toEqual(['plain']);
    expect(f.catalog.translate('plain', 'en-US', {}, TENANT)).toBe('cache value');
    f.context.actorId = '';
    expect(() => f.catalog.setTenantOverrides(TENANT, overrides)).toThrow();
    expect(calls).toEqual(['plain']);
    expect(f.events.slice(0, 3)).toEqual(['transaction-start', 'transaction-end', 'cache-write']);
  } finally {
    await f.module.close();
  }
});
it('uses the real formatter for native disk AST and string messages', async () => {
  const f = await fixture(),
    root = mkdtempSync(join(tmpdir(), 'stynx-i18n-ast-'));
  try {
    const folder = join(root, 'packages', 'sample', 'i18n');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'en-US.json'),
      JSON.stringify({
        plain: 'Hello {name}',
        ast: [
          { type: 0, value: 'AST ' },
          { type: 1, value: 'name' },
        ],
      }),
    );
    const catalog = new CatalogService(f.moduleRef, { workspaceRoot: root });
    expect(catalog.translate('plain', 'en-US', { name: 'Ana' })).toBe('Hello Ana');
    expect(catalog.translate('ast', 'en-US', { name: 'Ana' })).toBe('AST Ana');
  } finally {
    rmSync(root, { recursive: true, force: true });
    await f.module.close();
  }
});
it('preserves disk Object.entries boxing, nullish refusal and native message errors', async () => {
  const f = await fixture();
  try {
    for (const [content, key, expected] of [
      ['abc', '0', 'a'],
      [['array message'], '0', 'array message'],
      [{ message: 0 }, 'message', 'message'],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), 'stynx-i18n-boxing-'));
      try {
        const folder = join(root, 'packages', 'sample', 'i18n');
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, 'en-US.json'), JSON.stringify(content));
        expect(
          new CatalogService(f.moduleRef, { workspaceRoot: root }).translate(key, 'en-US'),
        ).toBe(expected);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    for (const [content, message] of [
      [null, 'Cannot convert undefined or null to object'],
      [{ message: 7 }, 'A message must be provided as a String or AST.'],
    ] as const) {
      const root = mkdtempSync(join(tmpdir(), 'stynx-i18n-invalid-'));
      try {
        const folder = join(root, 'packages', 'sample', 'i18n');
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, 'en-US.json'), JSON.stringify(content));
        expect(() =>
          new CatalogService(f.moduleRef, { workspaceRoot: root }).translate('message', 'en-US'),
        ).toThrow(new TypeError(message));
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  } finally {
    await f.module.close();
  }
});
it('preserves malformed ICU before variable reads and fallback getter error identity', async () => {
  const f = await fixture(),
    root = mkdtempSync(join(tmpdir(), 'stynx-i18n-order-'));
  try {
    const folder = join(root, 'packages', 'sample', 'i18n');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'en-US.json'),
      JSON.stringify({ plain: 'Fallback {name}', broken: 'broken {' }),
    );
    writeFileSync(join(folder, 'pt-BR.json'), JSON.stringify({ plain: 0 }));
    const catalog = new CatalogService(f.moduleRef, { workspaceRoot: root }),
      calls: string[] = [],
      sentinel = new Error('native variable sentinel');
    const vars = {
      get name(): string {
        expect(this).toBe(vars);
        calls.push('name');
        throw sentinel;
      },
    };
    let malformed: unknown;
    try {
      catalog.translate('broken', 'en-US', vars);
    } catch (error) {
      malformed = error;
    }
    expect(malformed).toBeInstanceOf(SyntaxError);
    expect(malformed).toMatchObject({
      message: 'EXPECT_ARGUMENT_CLOSING_BRACE',
      originalMessage: 'broken {',
    });
    expect(calls).toEqual([]);
    let caught: unknown;
    try {
      catalog.translate('plain', 'pt-BR', vars);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(sentinel);
    expect(calls).toEqual(['name']);
  } finally {
    rmSync(root, { recursive: true, force: true });
    await f.module.close();
  }
});
