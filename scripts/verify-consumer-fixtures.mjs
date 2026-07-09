#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), 'stynx-consumer-fixture-'));
const packDir = join(tempRoot, 'packs');
const fixturesRoot = join(tempRoot, 'consumers');

const packageSpecs = [
  { name: '@stynx-nyx/audit', dir: 'packages/audit' },
  { name: '@stynx-nyx/auth', dir: 'packages/auth' },
  { name: '@stynx-nyx/backend', dir: 'packages/backend' },
  { name: '@stynx-nyx/contracts', dir: 'packages/contracts' },
  { name: '@stynx-nyx/core', dir: 'packages/core' },
  { name: '@stynx-nyx/data', dir: 'packages/data' },
  { name: '@stynx-nyx/feature-flags', dir: 'packages/feature-flags' },
  { name: '@stynx-nyx/flow', dir: 'packages/flow' },
  { name: '@stynx-nyx/health', dir: 'packages/health' },
  { name: '@stynx-nyx/i18n', dir: 'packages/i18n' },
  { name: '@stynx-nyx/idempotency', dir: 'packages/idempotency' },
  { name: '@stynx-nyx/storage', dir: 'packages/storage' },
  { name: '@stynx-nyx/tenancy', dir: 'packages/tenancy' },
  { name: '@stynx-nyx/integration-adapter', dir: 'packages/integration-adapter' },
  { name: '@stynx-nyx/logging', dir: 'packages/logging' },
  { name: '@stynx-nyx/pdf-a', dir: 'packages/pdf-a' },
  { name: '@stynx-nyx/pdf-a-vera-docker', dir: 'packages/pdf-a-vera-docker' },
  { name: '@stynx-nyx/signature', dir: 'packages/signature' },
  { name: '@stynx-nyx/pdf', dir: 'packages/pdf' },
  { name: '@stynx-nyx/privacy', dir: 'packages/privacy' },
  { name: '@stynx-nyx/ratelimit', dir: 'packages/ratelimit' },
  { name: '@stynx-nyx/sessions', dir: 'packages/sessions' },
  { name: '@stynx-nyx/testing', dir: 'packages/testing' },
  { name: '@stynx-web/angular', dir: 'packages-web/angular' },
  { name: '@stynx-web/angular-audit', dir: 'packages-web/angular-audit' },
  { name: '@stynx-web/angular-auth', dir: 'packages-web/angular-auth' },
  { name: '@stynx-web/angular-flow', dir: 'packages-web/angular-flow' },
  { name: '@stynx-web/angular-i18n', dir: 'packages-web/angular-i18n' },
  { name: '@stynx-web/angular-iam', dir: 'packages-web/angular-iam' },
  { name: '@stynx-web/angular-profile', dir: 'packages-web/angular-profile' },
  { name: '@stynx-web/angular-sessions', dir: 'packages-web/angular-sessions' },
  { name: '@stynx-web/angular-storage', dir: 'packages-web/angular-storage' },
  { name: '@stynx-web/angular-tenancy', dir: 'packages-web/angular-tenancy' },
  { name: '@stynx-web/angular-trash', dir: 'packages-web/angular-trash' },
  { name: '@stynx-web/angular-ui', dir: 'packages-web/angular-ui' },
  { name: '@stynx-web/sdk', dir: 'packages-web/sdk' },
];

try {
  mkdirSync(packDir, { recursive: true });
  mkdirSync(fixturesRoot, { recursive: true });

  for (const spec of packageSpecs) {
    run('pnpm', ['--filter', spec.name, 'build'], repoRoot);
  }

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
    writeFileSync(
      join(fixtureDir, 'package.json'),
      `${JSON.stringify(fixture.packageJson, null, 2)}\n`,
    );
    writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), fixtureWorkspace(tarballs));
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

function fixtureWorkspace(tarballs) {
  const overrides = [...tarballs.entries()]
    .map(([name, tarball]) => `  '${name}': 'file:${tarball}'`)
    .join('\n');
  return `packages: []\noverrides:\n${overrides}\n`;
}

function sgpFixture(tarballs) {
  return {
    name: 'sgp',
    packageJson: basePackageJson('stynx-consumer-sgp-fixture', {
      '@nestjs/common': '^11.1.19',
      '@nestjs/core': '^11.1.19',
      '@stynx-nyx/audit': fileDependency(tarballs, '@stynx-nyx/audit'),
      '@stynx-nyx/auth': fileDependency(tarballs, '@stynx-nyx/auth'),
      '@stynx-nyx/backend': fileDependency(tarballs, '@stynx-nyx/backend'),
      '@stynx-nyx/core': fileDependency(tarballs, '@stynx-nyx/core'),
      '@stynx-nyx/data': fileDependency(tarballs, '@stynx-nyx/data'),
      '@stynx-nyx/storage': fileDependency(tarballs, '@stynx-nyx/storage'),
      '@stynx-nyx/tenancy': fileDependency(tarballs, '@stynx-nyx/tenancy'),
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    }),
    indexTs: `import { Audit } from '@stynx-nyx/backend';
import { Permission, StynxAuthGuard } from '@stynx-nyx/auth';
import { RequestContext } from '@stynx-nyx/core';
import type { AuditEvent } from '@stynx-nyx/audit';
import type { Database } from '@stynx-nyx/data';
import type { InitiateDocumentInput } from '@stynx-nyx/storage';
import type { ProvisionTenantInput } from '@stynx-nyx/tenancy';

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
      '@stynx-web/angular': fileDependency(tarballs, '@stynx-web/angular'),
      '@stynx-web/angular-audit': fileDependency(tarballs, '@stynx-web/angular-audit'),
      '@stynx-web/angular-auth': fileDependency(tarballs, '@stynx-web/angular-auth'),
      '@stynx-web/angular-flow': fileDependency(tarballs, '@stynx-web/angular-flow'),
      '@stynx-web/angular-i18n': fileDependency(tarballs, '@stynx-web/angular-i18n'),
      '@stynx-web/angular-storage': fileDependency(tarballs, '@stynx-web/angular-storage'),
      '@stynx-web/angular-tenancy': fileDependency(tarballs, '@stynx-web/angular-tenancy'),
      '@stynx-web/angular-ui': fileDependency(tarballs, '@stynx-web/angular-ui'),
      '@stynx-web/sdk': fileDependency(tarballs, '@stynx-web/sdk'),
      rxjs: '^7.8.2',
      tslib: '^2.8.1',
      'zone.js': '^0.16.0',
    }),
    indexTs: `import { GeneratedStynxSdk, StynxSdkClient } from '@stynx-web/sdk';
import { provideStynxAngular } from '@stynx-web/angular';
import { StynxAuditLogComponent, provideStynxAudit } from '@stynx-web/angular-audit';
import { provideStynxAuth } from '@stynx-web/angular-auth';
import { DocumentService } from '@stynx-web/angular-storage';
import { provideStynxFlow } from '@stynx-web/angular-flow';
import { provideTenancy, TenantContextService } from '@stynx-web/angular-tenancy';
import { StynxBannerComponent, StynxPaginationComponent } from '@stynx-web/angular-ui';

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
