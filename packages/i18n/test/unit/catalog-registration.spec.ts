import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { CatalogService } from '../../src/catalog.service.js';
import { StynxI18nModule } from '../../src/i18n.module.js';
import { LocaleService } from '../../src/locale.service.js';
import type { StynxI18nModuleOptions } from '../../src/types.js';

// SM-19: a consumer-shaped application. Its working directory has no
// `packages/*/i18n`; a generated feature module registers its own catalog
// programmatically, and the default locale is en-US unless pt-BR is configured.

const NOTES_CATALOG = {
  'en-US': { 'demo.notes.missing': 'Note not found.' },
  'pt-BR': { 'demo.notes.missing': 'Nota não encontrada.' },
};

@Injectable()
class NotesI18nRegistration implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    const catalog = this.moduleRef.get(CatalogService, { strict: false });
    for (const [locale, messages] of Object.entries(NOTES_CATALOG)) {
      catalog.registerCatalog(locale, messages);
    }
  }
}

@Module({ providers: [NotesI18nRegistration] })
class NotesModule {}

async function bootConsumer(options?: StynxI18nModuleOptions) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxCoreModule.forRoot({ appName: 'notes-consumer', schema: z.object({}) }),
      StynxI18nModule.forRoot(options),
      NotesModule,
    ],
  })
    // The admin controller's auth guards are out of scope for catalog loading.
    .overrideGuard(StynxAuthGuard)
    .useValue({ canActivate: () => false })
    .overrideGuard(PermissionGuard)
    .useValue({ canActivate: () => false })
    .compile();
  await moduleRef.init();
  return moduleRef;
}

describe('module catalog registration without a STYNX checkout (SM-19)', () => {
  let consumerRoot: string;
  let cwd: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consumerRoot = mkdtempSync(join(tmpdir(), 'stynx-i18n-consumer-'));
    cwd = vi.spyOn(process, 'cwd').mockReturnValue(consumerRoot);
  });

  afterEach(() => {
    cwd.mockRestore();
    rmSync(consumerRoot, { recursive: true, force: true });
  });

  it('resolves a generated module key with no packages/*/i18n present and defaults to en-US', async () => {
    expect(existsSync(join(consumerRoot, 'packages'))).toBe(false);
    const moduleRef = await bootConsumer();
    try {
      const catalog = moduleRef.get(CatalogService);
      const locale = moduleRef.get(LocaleService);

      expect(catalog.defaultLocale()).toBe('en-US');
      expect(catalog.supportedLocales().sort()).toEqual(['en-US', 'pt-BR']);
      expect(catalog.translate('demo.notes.missing', 'en-US')).toBe('Note not found.');
      expect(catalog.translate('demo.notes.missing', 'pt-BR')).toBe('Nota não encontrada.');
      expect(locale.t('demo.notes.missing')).toBe('Note not found.');
    } finally {
      await moduleRef.close();
    }
  });

  it('uses pt-BR only when it is configured', async () => {
    const moduleRef = await bootConsumer({ defaultLocale: 'pt-BR' });
    try {
      expect(moduleRef.get(CatalogService).defaultLocale()).toBe('pt-BR');
      expect(moduleRef.get(LocaleService).t('demo.notes.missing')).toBe('Nota não encontrada.');
    } finally {
      await moduleRef.close();
    }
  });

  it('accepts catalogs through forRoot options and lets later registrations override keys', async () => {
    const moduleRef = await bootConsumer({
      catalogs: { 'en-US': { 'demo.notes.missing': 'Configured.', 'demo.notes.title': 'Notes' } },
    });
    try {
      const catalog = moduleRef.get(CatalogService);
      expect(catalog.translate('demo.notes.title', 'en-US')).toBe('Notes');
      expect(catalog.translate('demo.notes.missing', 'en-US')).toBe('Note not found.');
      expect(catalog.translate('demo.notes.title', 'pt-BR')).toBe('Notes');
      expect(cwd).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });
});
