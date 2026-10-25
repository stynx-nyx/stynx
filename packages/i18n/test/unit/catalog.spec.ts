import { createFakeTransaction } from '@stynx-nyx/testing';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ModuleRef } from '@nestjs/core';
import { systemModuleRef } from '../support/module-ref.js';
import { CatalogService } from '../../src/catalog.service.js';

const TENANT_A = '00000000-0000-4000-8000-000000000001';
const TENANT_NULL = '00000000-0000-4000-8000-000000000003';

function makeWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'stynx-i18n-cat-'));
  mkdirSync(join(root, 'packages', 'sample-a', 'i18n'), { recursive: true });
  mkdirSync(join(root, 'packages', 'sample-b', 'i18n'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'sample-a', 'i18n', 'en-US.json'),
    JSON.stringify({ 'greeting.hello': 'Hello, {name}!' }),
  );
  writeFileSync(
    join(root, 'packages', 'sample-a', 'i18n', 'pt-BR.json'),
    JSON.stringify({ 'greeting.hello': 'Olá, {name}!' }),
  );
  writeFileSync(
    join(root, 'packages', 'sample-b', 'i18n', 'en-US.json'),
    JSON.stringify({ 'app.title': 'Stynx' }),
  );
  return root;
}

function buildService(workspaceRoot: string): CatalogService {
  const moduleRef = systemModuleRef();
  return new CatalogService(moduleRef, {
    workspaceRoot,
    defaultLocale: 'pt-BR',
  });
}

describe('CatalogService.translate', () => {
  let root: string;
  let service: CatalogService;

  beforeEach(() => {
    root = makeWorkspace();
    service = buildService(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns the locale-specific message when present', () => {
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' })).toBe('Olá, Ana!');
  });

  it('falls back to en-US when the requested locale lacks the key', () => {
    // app.title only exists in en-US (loaded from sample-b)
    expect(service.translate('app.title', 'pt-BR')).toBe('Stynx');
  });

  it('returns the key when no catalog has the message', () => {
    expect(service.translate('missing.key', 'pt-BR')).toBe('missing.key');
  });

  it('does not scan process cwd when no workspace root is configured (SM-19)', () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const svc = new CatalogService({ get: vi.fn() } as unknown as ModuleRef, {
        defaultLocale: 'pt-BR',
      });

      expect(svc.supportedLocales()).toContain('pt-BR');
      expect(svc.translate('greeting.hello', 'pt-BR', { name: 'Ana' })).toBe('greeting.hello');
      expect(cwd).not.toHaveBeenCalled();
    } finally {
      cwd.mockRestore();
    }
  });

  it('merges tenant overrides over the base catalog', () => {
    service.setTenantOverrides(TENANT_A, {
      'i18n.override.pt-BR.greeting.hello': 'Bem-vindo, {name}!',
    });
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, TENANT_A)).toBe(
      'Bem-vindo, Ana!',
    );
    // Other tenant unaffected
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, 'tenant-b')).toBe(
      'Olá, Ana!',
    );
  });

  it('ignores override entries that do not match the i18n.override.<locale>.<key> shape', () => {
    service.setTenantOverrides(TENANT_A, {
      'i18n.override.': 'malformed',
      'unrelated.key': 'noise',
      'i18n.override.pt-BR.greeting.hello': 'Welcome, {name}!',
      'i18n.override.es-ES.greeting.hello': 'Hola, {name}!',
    });
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, TENANT_A)).toBe(
      'Welcome, Ana!',
    );
    expect(service.translate('greeting.hello', 'es-ES', { name: 'Ana' }, TENANT_A)).toBe(
      'Hola, Ana!',
    );
  });
});

describe('CatalogService.supportedLocales', () => {
  let root: string;
  let service: CatalogService;

  beforeEach(() => {
    root = makeWorkspace();
    service = buildService(root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('includes every locale discovered across all packages', () => {
    const locales = service.supportedLocales();
    expect(locales).toEqual(expect.arrayContaining(['en-US', 'pt-BR']));
  });

  it('always includes en-US even if no catalog file provided one', () => {
    const empty = mkdtempSync(join(tmpdir(), 'stynx-i18n-empty-'));
    try {
      mkdirSync(join(empty, 'packages'), { recursive: true });
      const svc = buildService(empty);
      const locales = svc.supportedLocales();
      expect(locales).toContain('en-US');
      expect(locales).toContain('pt-BR'); // defaultLocale
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('skips package entries whose i18n path is not a directory and uses the built-in en-US default', () => {
    const rootWithFile = mkdtempSync(join(tmpdir(), 'stynx-i18n-file-'));
    try {
      mkdirSync(join(rootWithFile, 'packages', 'sample-file'), { recursive: true });
      writeFileSync(join(rootWithFile, 'packages', 'sample-file', 'i18n'), 'not a directory');
      const svc = new CatalogService({ get: vi.fn() } as unknown as ModuleRef, {
        workspaceRoot: rootWithFile,
      });

      // SM-19: the built-in default is en-US; pt-BR appears only when configured.
      expect(svc.supportedLocales()).toEqual(['en-US']);
      expect(svc.defaultLocale()).toBe('en-US');
    } finally {
      rmSync(rootWithFile, { recursive: true, force: true });
    }
  });

  it('loads tenant overrides once and reuses the cache', async () => {
    const fake = createFakeTransaction(
      [
        {
          rows: [
            {
              settings: {
                'i18n.override.pt-BR.greeting.hello': 'Oi, {name}!',
                unrelated: 'ignored',
              },
            },
          ],
          rowCount: 1,
        },
      ],
      { role: 'owner' },
    );
    const moduleRef = systemModuleRef({
      withSystemContext: vi.fn(async (_label: string, callback: () => Promise<unknown>) =>
        callback(),
      ),
      txIndependent: vi.fn(async (callback: (trx: typeof fake.transaction) => Promise<unknown>) =>
        callback(fake.transaction),
      ),
    });
    const svc = new CatalogService(moduleRef, {
      workspaceRoot: root,
      defaultLocale: 'pt-BR',
    });

    await svc.primeTenantOverrides(TENANT_A);
    await svc.primeTenantOverrides(TENANT_A);

    expect(fake.queries).toHaveLength(1);
    expect(svc.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, TENANT_A)).toBe('Oi, Ana!');
  });

  it('reads packages-web catalogs and handles null tenant settings', async () => {
    const webRoot = mkdtempSync(join(tmpdir(), 'stynx-i18n-web-'));
    try {
      mkdirSync(join(webRoot, 'packages-web', 'sample-web', 'i18n'), { recursive: true });
      mkdirSync(join(webRoot, 'packages', 'sample-no-i18n'), { recursive: true });
      writeFileSync(
        join(webRoot, 'packages-web', 'sample-web', 'i18n', 'en-US.json'),
        JSON.stringify({
          'web.title': 'Web title',
        }),
      );
      writeFileSync(join(webRoot, 'packages-web', 'sample-web', 'i18n', 'README.md'), 'ignored');
      const fake = createFakeTransaction([{ rows: [{ settings: null }], rowCount: 1 }], {
        role: 'owner',
      });
      const moduleRef = systemModuleRef({
        withSystemContext: vi.fn(async (_label: string, callback: () => Promise<unknown>) =>
          callback(),
        ),
        txIndependent: vi.fn(async (callback: (trx: typeof fake.transaction) => Promise<unknown>) =>
          callback(fake.transaction),
        ),
      });
      const svc = new CatalogService(moduleRef, {
        workspaceRoot: webRoot,
        defaultLocale: 'pt-BR',
      });

      await svc.primeTenantOverrides(TENANT_NULL);

      expect(svc.translate('web.title', 'en-US')).toBe('Web title');
      expect(fake.queries).toHaveLength(1);
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });

  it('ignores filenames that merely contain or extend the json suffix', () => {
    writeFileSync(
      join(root, 'packages', 'sample-a', 'i18n', 'fr-FR.json.backup'),
      JSON.stringify({
        'greeting.hello': 'Bonjour',
      }),
    );
    writeFileSync(join(root, 'packages', 'sample-a', 'i18n', 'READMEjson'), '{}');
    const svc = buildService(root);

    expect(svc.supportedLocales()).not.toContain('fr-FR.json.backup');
    expect(svc.supportedLocales()).not.toContain('READMEjson');
  });

  it('accepts only fully anchored tenant override keys', () => {
    service.setTenantOverrides(TENANT_A, {
      'prefix.i18n.override.pt-BR.greeting.hello': 'prefix accepted',
      'i18n.override.pt-BR.greeting.hello.suffix': 'suffix key',
    });

    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, TENANT_A)).toBe(
      'Olá, Ana!',
    );
    expect(service.translate('greeting.hello.suffix', 'pt-BR', {}, TENANT_A)).toBe('suffix key');
  });
});
