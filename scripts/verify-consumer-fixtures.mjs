#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { discoverPublishablePackages } from './lib/publishable-packages.mjs';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'stynx-consumer-fixture-'));
const packDir = join(tempRoot, 'packs');
const fixturesRoot = join(tempRoot, 'consumers');

const packageSpecs = discoverPublishablePackages(repoRoot);

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(fixturesRoot, { recursive: true });

  run('pnpm', ['build'], repoRoot);

  const tarballs = new Map();
  for (const spec of packageSpecs) {
    const stdout = run(
      'pnpm',
      ['--dir', spec.dir, 'pack', '--pack-destination', packDir, '--json'],
      repoRoot,
    );
    const tarball = packedFile(stdout, spec.name);
    assertPackedManifest(tarball, spec.name);
    tarballs.set(spec.name, tarball);
  }

  const fixtureSpecs = consumerFixtureSpecs(tarballs);
  for (const fixture of fixtureSpecs) {
    const fixtureDir = join(fixturesRoot, fixture.name);
    mkdirSync(fixtureDir, { recursive: true });
    fixture.packageJson.pnpm = { overrides: tarballOverrides(tarballs) };
    writeFileSync(
      join(fixtureDir, 'package.json'),
      `${JSON.stringify(fixture.packageJson, null, 2)}\n`,
    );
    writeFileSync(join(fixtureDir, 'tsconfig.json'), `${JSON.stringify(tsconfig(), null, 2)}\n`);
    writeFileSync(join(fixtureDir, 'index.ts'), fixture.indexTs);
    run('pnpm', ['install', '--ignore-scripts', '--config.auto-install-peers=false'], fixtureDir);
    run('pnpm', ['run', 'typecheck'], fixtureDir);
  }

  console.log(
    `[consumer-fixture] OK: ${packageSpecs.length} tarballs installed across ${fixtureSpecs.length} adopter-style fixtures`,
  );
} finally {
  if (process.env.STYNX_KEEP_CONSUMER_FIXTURE !== '1') {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[consumer-fixture] kept ${tempRoot}`);
  }
}

function consumerFixtureSpecs(tarballs) {
  return [sgpFixture(tarballs), pecFixture(tarballs), teatFixture(tarballs)];
}

function basePackageJson(name, dependencies) {
  return {
    name,
    private: true,
    type: 'module',
    scripts: {
      typecheck: 'tsc -p tsconfig.json --noEmit',
    },
    dependencies: {
      typescript: '^5.9.3',
      ...dependencies,
    },
  };
}

function fileDependency(tarballs, packageName) {
  return `file:${tarballs.get(packageName)}`;
}

function tarballOverrides(tarballs) {
  return Object.fromEntries(
    [...tarballs.entries()].map(([packageName, tarball]) => [packageName, `file:${tarball}`]),
  );
}

function sgpFixture(tarballs) {
  return {
    name: 'sgp',
    packageJson: basePackageJson('stynx-consumer-sgp-fixture', {
      '@angular/common': '21.2.15',
      '@angular/core': '21.2.15',
      '@angular/forms': '21.2.15',
      '@angular/router': '21.2.15',
      '@nestjs/common': '^11.1.19',
      '@nestjs/core': '^11.1.19',
      '@stynx-nyx/audit': fileDependency(tarballs, '@stynx-nyx/audit'),
      '@stynx-nyx/auth': fileDependency(tarballs, '@stynx-nyx/auth'),
      '@stynx-nyx/backend': fileDependency(tarballs, '@stynx-nyx/backend'),
      '@stynx-nyx/core': fileDependency(tarballs, '@stynx-nyx/core'),
      '@stynx-nyx/data': fileDependency(tarballs, '@stynx-nyx/data'),
      '@stynx-nyx/preferences': fileDependency(tarballs, '@stynx-nyx/preferences'),
      '@stynx-nyx/storage': fileDependency(tarballs, '@stynx-nyx/storage'),
      '@stynx-nyx/tenancy': fileDependency(tarballs, '@stynx-nyx/tenancy'),
      '@stynx-nyx/angular-profile': fileDependency(tarballs, '@stynx-nyx/angular-profile'),
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
      tslib: '^2.8.1',
      'zone.js': '^0.16.0',
    }),
    indexTs: `import { Audit } from '@stynx-nyx/backend';
import { Permission, StynxAuthGuard } from '@stynx-nyx/auth';
import { RequestContext } from '@stynx-nyx/core';
import type { AuditEvent } from '@stynx-nyx/audit';
import type { Database } from '@stynx-nyx/data';
import type { InitiateDocumentInput } from '@stynx-nyx/storage';
import type { ProvisionTenantInput } from '@stynx-nyx/tenancy';
import { InMemoryPreferencesStore, StynxPreferencesModule } from '@stynx-nyx/preferences';
import type { PreferenceValues } from '@stynx-nyx/preferences';
import { ProfileService, provideStynxProfile } from '@stynx-nyx/angular-profile';

export const sgpPreferenceDefaults: PreferenceValues = {
  locale: { locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
  theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
  accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
  notificationDelivery: { email: true, push: true, inApp: true },
};
export const sgpPreferencesBackend = StynxPreferencesModule.forRoot({
  defaults: sgpPreferenceDefaults,
  store: new InMemoryPreferencesStore(),
});
export const sgpProfileFrontend = [ProfileService, provideStynxProfile];

export class SgpRecordsController {
  constructor(
    readonly context: RequestContext,
    readonly database: Database,
  ) {}

  @Permission('records:write')
  @Audit({ action: 'sgp.record.create', entity: 'sgp.records' })
  create(input: InitiateDocumentInput, tenant: ProvisionTenantInput, event: AuditEvent): unknown {
    return { guard: StynxAuthGuard, input, tenant, event };
  }
}
`,
  };
}

function pecFixture(tarballs) {
  return {
    name: 'pec',
    packageJson: basePackageJson('stynx-consumer-pec-fixture', {
      '@nestjs/common': '^11.1.19',
      '@nestjs/core': '^11.1.19',
      '@stynx-nyx/integration-adapter': fileDependency(tarballs, '@stynx-nyx/integration-adapter'),
      '@stynx-nyx/pdf': fileDependency(tarballs, '@stynx-nyx/pdf'),
      '@stynx-nyx/signature': fileDependency(tarballs, '@stynx-nyx/signature'),
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    }),
    indexTs: `import { IntegrationAdapter, InMemoryCircuitBreaker } from '@stynx-nyx/integration-adapter';
import { PdfVerificationEvidenceAppender } from '@stynx-nyx/pdf/evidence';
import { PublicPayrollPdfBuilder } from '@stynx-nyx/pdf/public-payroll';
import { XmlDSigVerifier } from '@stynx-nyx/signature/xmldsig';
import type { SignatureRequest, VerifyRequest } from '@stynx-nyx/signature';

export const pecSurface = {
  IntegrationAdapter,
  InMemoryCircuitBreaker,
  PdfVerificationEvidenceAppender,
  PublicPayrollPdfBuilder,
  XmlDSigVerifier,
};

export type PecSignatureInputs = SignatureRequest | VerifyRequest;
`,
  };
}

function teatFixture(tarballs) {
  return {
    name: 'teat',
    packageJson: basePackageJson('stynx-consumer-teat-fixture', {
      '@angular/common': '21.2.15',
      '@angular/core': '21.2.15',
      '@angular/forms': '21.2.15',
      '@angular/router': '21.2.15',
      '@stynx-nyx/angular': fileDependency(tarballs, '@stynx-nyx/angular'),
      '@stynx-nyx/angular-audit': fileDependency(tarballs, '@stynx-nyx/angular-audit'),
      '@stynx-nyx/angular-auth': fileDependency(tarballs, '@stynx-nyx/angular-auth'),
      '@stynx-nyx/angular-flow': fileDependency(tarballs, '@stynx-nyx/angular-flow'),
      '@stynx-nyx/angular-i18n': fileDependency(tarballs, '@stynx-nyx/angular-i18n'),
      '@stynx-nyx/angular-storage': fileDependency(tarballs, '@stynx-nyx/angular-storage'),
      '@stynx-nyx/angular-tenancy': fileDependency(tarballs, '@stynx-nyx/angular-tenancy'),
      '@stynx-nyx/angular-ui': fileDependency(tarballs, '@stynx-nyx/angular-ui'),
      '@stynx-nyx/mobile-runtime': fileDependency(tarballs, '@stynx-nyx/mobile-runtime'),
      '@stynx-nyx/offline-sync': fileDependency(tarballs, '@stynx-nyx/offline-sync'),
      '@stynx-nyx/sdk': fileDependency(tarballs, '@stynx-nyx/sdk'),
      '@nestjs/common': '^11.1.19',
      '@nestjs/core': '^11.1.19',
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
      tslib: '^2.8.1',
      'zone.js': '^0.16.0',
    }),
    indexTs: `import { GeneratedStynxSdk, StynxSdkClient } from '@stynx-nyx/sdk';
import { provideStynxAngular } from '@stynx-nyx/angular';
import { StynxAuditLogComponent, provideStynxAudit } from '@stynx-nyx/angular-audit';
import { provideStynxAuth } from '@stynx-nyx/angular-auth';
import { DocumentService } from '@stynx-nyx/angular-storage';
import { provideStynxFlow } from '@stynx-nyx/angular-flow';
import { provideTenancy, TenantContextService } from '@stynx-nyx/angular-tenancy';
import { StynxBannerComponent, StynxPaginationComponent } from '@stynx-nyx/angular-ui';
import { OfflineFirstMobileRuntime } from '@stynx-nyx/mobile-runtime';
import { InMemoryEncryptedMobileStore } from '@stynx-nyx/mobile-runtime/testing';
import { StynxOfflineSyncModule } from '@stynx-nyx/offline-sync';

const sdk = new GeneratedStynxSdk({ BASE: 'https://api.example.test' });
if (typeof sdk.stynxAuth.stynxAuthGetPlatformPermsBySidInspect !== 'function') {
  throw new Error('Generated SDK path-parameter method is missing');
}

export const teatProviders = [
  provideStynxAngular,
  provideStynxAudit,
  provideStynxAuth,
  provideStynxFlow,
  provideTenancy,
];
export const sdkClient = StynxSdkClient;
export const documentService = DocumentService;
export const teatComponents = [StynxAuditLogComponent, StynxBannerComponent, StynxPaginationComponent];
export const tenantContext = TenantContextService;
export type TeatMobileEntityType = 'ait';
export const mobileRuntime = OfflineFirstMobileRuntime;
export const mobileEncryptedStore = InMemoryEncryptedMobileStore;
export const offlineSyncModule = StynxOfflineSyncModule;
`,
  };
}

function tsconfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      skipLibCheck: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: false,
      noEmit: true,
    },
    include: ['index.ts'],
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`.trim(),
    );
  }
  return result.stdout.trim();
}

function packedFile(stdout, packageName) {
  const parsed = JSON.parse(stdout);
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : parsed.filename;
  if (!filename) throw new Error(`Could not resolve packed tarball for ${packageName}`);
  return isAbsolute(filename) ? filename : resolve(packDir, filename);
}

function assertPackedManifest(tarball, packageName) {
  const manifestText = run('tar', ['-xOf', tarball, 'package/package.json'], repoRoot);
  const manifest = JSON.parse(manifestText);
  const serialized = JSON.stringify(manifest);
  if (serialized.includes('workspace:')) {
    throw new Error(`${packageName} tarball ${basename(tarball)} leaks workspace: dependencies`);
  }
  if (!manifest.exports?.['.']) {
    throw new Error(`${packageName} tarball is missing root export`);
  }
}
