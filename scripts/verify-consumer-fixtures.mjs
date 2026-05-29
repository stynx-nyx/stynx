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
  { name: '@stynx/audit', dir: 'packages/audit' },
  { name: '@stynx/auth', dir: 'packages/auth' },
  { name: '@stynx/backend', dir: 'packages/backend' },
  { name: '@stynx/contracts', dir: 'packages/contracts' },
  { name: '@stynx/core', dir: 'packages/core' },
  { name: '@stynx/data', dir: 'packages/data' },
  { name: '@stynx/feature-flags', dir: 'packages/feature-flags' },
  { name: '@stynx/flow', dir: 'packages/flow' },
  { name: '@stynx/health', dir: 'packages/health' },
  { name: '@stynx/i18n', dir: 'packages/i18n' },
  { name: '@stynx/idempotency', dir: 'packages/idempotency' },
  { name: '@stynx/storage', dir: 'packages/storage' },
  { name: '@stynx/tenancy', dir: 'packages/tenancy' },
  { name: '@stynx/integration-adapter', dir: 'packages/integration-adapter' },
  { name: '@stynx/logging', dir: 'packages/logging' },
  { name: '@stynx/pdf-a', dir: 'packages/pdf-a' },
  { name: '@stynx/pdf-a-vera-docker', dir: 'packages/pdf-a-vera-docker' },
  { name: '@stynx/signature', dir: 'packages/signature' },
  { name: '@stynx/pdf', dir: 'packages/pdf' },
  { name: '@stynx/privacy', dir: 'packages/privacy' },
  { name: '@stynx/ratelimit', dir: 'packages/ratelimit' },
  { name: '@stynx/sessions', dir: 'packages/sessions' },
  { name: '@stynx/testing', dir: 'packages/testing' },
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
    const stdout = run('pnpm', ['--dir', spec.dir, 'pack', '--pack-destination', packDir, '--json'], repoRoot);
    const tarball = packedFile(stdout, spec.name);
    assertPackedManifest(tarball, spec.name);
    tarballs.set(spec.name, tarball);
  }

  const fixtureSpecs = consumerFixtureSpecs(tarballs);
  for (const fixture of fixtureSpecs) {
    const fixtureDir = join(fixturesRoot, fixture.name);
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, 'package.json'), `${JSON.stringify(fixture.packageJson, null, 2)}\n`);
    writeFileSync(join(fixtureDir, 'pnpm-workspace.yaml'), fixtureWorkspace(tarballs));
    writeFileSync(join(fixtureDir, 'tsconfig.json'), `${JSON.stringify(tsconfig(), null, 2)}\n`);
    writeFileSync(join(fixtureDir, 'index.ts'), fixture.indexTs);
    run('pnpm', ['install', '--ignore-scripts', '--config.auto-install-peers=false'], fixtureDir);
    run('pnpm', ['run', 'typecheck'], fixtureDir);
  }

  console.log(`[consumer-fixture] OK: ${packageSpecs.length} tarballs installed across ${fixtureSpecs.length} adopter-style fixtures`);
} finally {
  if (process.env.STYNX_KEEP_CONSUMER_FIXTURE !== '1') {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`[consumer-fixture] kept ${tempRoot}`);
  }
}

function consumerFixtureSpecs(tarballs) {
  return [
    sgpFixture(tarballs),
    pecFixture(tarballs),
    teatFixture(tarballs),
  ];
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
      '@stynx/audit': fileDependency(tarballs, '@stynx/audit'),
      '@stynx/auth': fileDependency(tarballs, '@stynx/auth'),
      '@stynx/backend': fileDependency(tarballs, '@stynx/backend'),
      '@stynx/core': fileDependency(tarballs, '@stynx/core'),
      '@stynx/data': fileDependency(tarballs, '@stynx/data'),
      '@stynx/storage': fileDependency(tarballs, '@stynx/storage'),
      '@stynx/tenancy': fileDependency(tarballs, '@stynx/tenancy'),
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    }),
    indexTs: `import { Audit } from '@stynx/backend';
import { Permission, StynxAuthGuard } from '@stynx/auth';
import { RequestContext } from '@stynx/core';
import type { AuditEvent } from '@stynx/audit';
import type { Database } from '@stynx/data';
import type { InitiateDocumentInput } from '@stynx/storage';
import type { ProvisionTenantInput } from '@stynx/tenancy';

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
      '@stynx/integration-adapter': fileDependency(tarballs, '@stynx/integration-adapter'),
      '@stynx/pdf': fileDependency(tarballs, '@stynx/pdf'),
      '@stynx/signature': fileDependency(tarballs, '@stynx/signature'),
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.2',
    }),
    indexTs: `import { IntegrationAdapter, InMemoryCircuitBreaker } from '@stynx/integration-adapter';
import { PdfVerificationEvidenceAppender } from '@stynx/pdf/evidence';
import { PublicPayrollPdfBuilder } from '@stynx/pdf/public-payroll';
import { XmlDSigVerifier } from '@stynx/signature/xmldsig';
import type { SignatureRequest, VerifyRequest } from '@stynx/signature';

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
      '@stynx-web/angular-auth': fileDependency(tarballs, '@stynx-web/angular-auth'),
      '@stynx-web/angular-flow': fileDependency(tarballs, '@stynx-web/angular-flow'),
      '@stynx-web/angular-storage': fileDependency(tarballs, '@stynx-web/angular-storage'),
      '@stynx-web/sdk': fileDependency(tarballs, '@stynx-web/sdk'),
      rxjs: '^7.8.2',
      tslib: '^2.8.1',
      'zone.js': '^0.16.0',
    }),
    indexTs: `import { GeneratedStynxSdk, StynxSdkClient } from '@stynx-web/sdk';
import { provideStynxAngular } from '@stynx-web/angular';
import { provideStynxAuth } from '@stynx-web/angular-auth';
import { DocumentService } from '@stynx-web/angular-storage';
import { provideStynxFlow } from '@stynx-web/angular-flow';

const sdk = new GeneratedStynxSdk({ BASE: 'https://api.example.test' });
if (typeof sdk.stynxAuth.stynxAuthGetPlatformPermsBySidInspect !== 'function') {
  throw new Error('Generated SDK path-parameter method is missing');
}

export const teatProviders = [provideStynxAngular, provideStynxAuth, provideStynxFlow];
export const sdkClient = StynxSdkClient;
export const documentService = DocumentService;
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
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`.trim());
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
