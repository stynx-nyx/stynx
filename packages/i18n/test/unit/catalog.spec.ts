import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ModuleRef } from '@nestjs/core';
import { CatalogService } from '../../src/catalog.service';

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
  const moduleRef = { get: jest.fn() } as unknown as ModuleRef;
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

  it('merges tenant overrides over the base catalog', () => {
    service.setTenantOverrides('tenant-a', {
      'i18n.override.pt-BR.greeting.hello': 'Bem-vindo, {name}!',
    });
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, 'tenant-a')).toBe(
      'Bem-vindo, Ana!',
    );
    // Other tenant unaffected
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, 'tenant-b')).toBe(
      'Olá, Ana!',
    );
  });

  it('ignores override entries that do not match the i18n.override.<locale>.<key> shape', () => {
    service.setTenantOverrides('tenant-a', {
      'i18n.override.': 'malformed',
      'unrelated.key': 'noise',
      'i18n.override.pt-BR.greeting.hello': 'Welcome, {name}!',
    });
    expect(service.translate('greeting.hello', 'pt-BR', { name: 'Ana' }, 'tenant-a')).toBe(
      'Welcome, Ana!',
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
});
