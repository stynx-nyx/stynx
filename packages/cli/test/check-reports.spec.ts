const engines = vi.hoisted(() => ({
  inventoryRoutes: vi.fn(),
  readBoundaryConfig: vi.fn(),
  verifyStynxBoundary: vi.fn(),
  verifyApiCoverage: vi.fn(),
  verifyOpenApiContract: vi.fn(),
  discoverPackages: vi.fn(),
  currentBaselines: vi.fn(),
  compareBaselines: vi.fn(),
  verifyRlsNegative: vi.fn(),
}));

// The engines are shared plain-ESM modules exercised end to end by check-entry-points.spec.ts;
// here they are replaced so each report-mapping branch of checks.ts is driven deterministically.
vi.mock('../engines/list-routes.mjs', () => ({ inventoryRoutes: engines.inventoryRoutes }));
vi.mock('../engines/stynx-boundary.mjs', () => ({
  readBoundaryConfig: engines.readBoundaryConfig,
  verifyStynxBoundary: engines.verifyStynxBoundary,
}));
vi.mock('../engines/api-coverage.mjs', () => ({ verifyApiCoverage: engines.verifyApiCoverage }));
vi.mock('../engines/openapi-contract.mjs', () => ({
  verifyOpenApiContract: engines.verifyOpenApiContract,
}));
vi.mock('../engines/public-api-baselines.mjs', () => ({
  discoverPackages: engines.discoverPackages,
  currentBaselines: engines.currentBaselines,
  compareBaselines: engines.compareBaselines,
}));
vi.mock('../engines/rls-negative.mjs', () => ({ verifyRlsNegative: engines.verifyRlsNegative }));

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { exitCodeFor, formatCheckText, runCheck, type CheckReport } from '../src/checks.js';

const workspace = mkdtempSync(join(tmpdir(), 'stynx-check-reports-'));
let counter = 0;

function consumer(files: Record<string, string> = {}, dirs: string[] = []): string {
  counter += 1;
  const root = join(workspace, `root-${counter}`);
  mkdirSync(root, { recursive: true });
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function stynxrc(value: unknown): Record<string, string> {
  return { '.stynxrc.json': `${JSON.stringify(value, null, 2)}\n` };
}

const emptySummary = {
  openapiPath: null,
  openapiPaths: 0,
  implementedOperations: 0,
  implementedRoutes: 0,
  parameterNameMismatches: [],
  missingInCode: [],
  missingInOpenApi: [],
  operationDrift: [],
  compositionDrift: [],
};

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('exitCodeFor and formatCheckText', () => {
  it('maps PASS/FAIL/UNKNOWN to 0/1/2', () => {
    expect(exitCodeFor({ status: 'PASS' })).toBe(0);
    expect(exitCodeFor({ status: 'FAIL' })).toBe(1);
    expect(exitCodeFor({ status: 'UNKNOWN' })).toBe(2);
  });

  it('renders the reason and findings with and without standard and hint', () => {
    const report: CheckReport = {
      schemaVersion: '1',
      command: 'verify-rls-negative',
      status: 'UNKNOWN',
      reason: 'runner-crashed',
      counts: { expected: 3, observed: 1, evaluated: 1 },
      findings: [
        { locator: 'a.sql:2', message: 'bare' },
        { locator: 'b.sql:4', message: 'full', standard: 'S-02', hint: 'fix it' },
      ],
    };
    expect(formatCheckText(report)).toBe(
      'verify-rls-negative: UNKNOWN (runner-crashed) observed 1/3\na.sql:2 bare\nb.sql:4 full [S-02] fix it\n',
    );
  });
});

describe('list-routes', () => {
  it('uses the template roots by default and expands * segments in sorted order', async () => {
    const root = consumer({ 'apps/readme.txt': 'not a directory root\n' }, [
      'domain/zeta/api/src',
      'domain/alpha/api/src',
      'domain/.hidden/api/src',
      'domain/node_modules/api/src',
      'domain/beta/api',
      'apps/web/src',
    ]);
    engines.inventoryRoutes.mockReturnValue({ scanned: [], routes: [], findings: [] });
    const report = await runCheck('list-routes', {}, root);
    expect(engines.inventoryRoutes).toHaveBeenCalledWith({
      repoRoot: root,
      scanRoots: ['domain/alpha/api/src', 'domain/zeta/api/src', 'apps/web/src'],
    });
    expect(report).toMatchObject({
      status: 'PASS',
      counts: { expected: 0, observed: 0, evaluated: 0 },
      roots: ['domain/*/api/src', 'apps/*/src'],
    });
    expect(exitCodeFor(report)).toBe(0);
  });

  it('expands nested patterns, drops missing and duplicate roots, and ignores files under *', async () => {
    const root = consumer({ 'lib/file.ts': 'export {};\n' }, ['one/a/src', 'one/b/src', 'two']);
    engines.inventoryRoutes.mockReturnValue({ scanned: [], routes: [], findings: [] });
    const report = await runCheck(
      'list-routes',
      { roots: ' */*/src , one/a/src, missing/*, lib/file.ts/*, *, /, ,two' },
      root,
    );
    expect(report.resolvedRoots).toEqual(['one/a/src', 'one/b/src', 'lib', 'one', 'two']);
  });

  it('fails on unreadable declarations and excludes their files from the observed count', async () => {
    const root = consumer();
    engines.inventoryRoutes.mockReturnValue({
      scanned: ['a.controller.ts', 'b.controller.ts', 'c.controller.ts'],
      routes: [
        {
          package: '@consumer/api',
          controller: 'NotesController',
          method: 'GET',
          path: '/notes',
          permissions: 'notes:read',
          rateLimitClass: 'default',
          file: 'a.controller.ts',
          handler: 'list',
          position: { line: 7 },
        },
      ],
      findings: [
        { locator: 'b.controller.ts:5', message: 'unsupported computed route selector x()' },
        { locator: 'b.controller.ts:9', message: 'unsupported computed route selector y()' },
      ],
    });
    const report = await runCheck('list-routes', { roots: 'src' }, root);
    expect(report.status).toBe('FAIL');
    expect(exitCodeFor(report)).toBe(1);
    expect(report.counts).toEqual({ expected: 3, observed: 2, evaluated: 2 });
    expect(report.findings).toEqual([
      {
        locator: 'b.controller.ts:5',
        message: 'unsupported computed route selector x()',
        standard: 'S-25',
        hint: 'use literal decorator arguments',
      },
      {
        locator: 'b.controller.ts:9',
        message: 'unsupported computed route selector y()',
        standard: 'S-25',
        hint: 'use literal decorator arguments',
      },
    ]);
    expect(report.routes).toEqual([
      expect.objectContaining({ handler: 'list', locator: 'a.controller.ts:7' }),
    ]);
  });
});

describe('verify-stynx-boundary', () => {
  it('fails with a .stynxrc.json locator when the boundary is undeclared', async () => {
    engines.readBoundaryConfig.mockReturnValue(null);
    const report = await runCheck('verify-stynx-boundary', {}, consumer());
    expect(report).toMatchObject({
      status: 'FAIL',
      counts: { expected: 0, observed: 0, evaluated: 0 },
      config: null,
      scanned: [],
      findings: [{ locator: '.stynxrc.json:1', standard: 'S-34' }],
    });
    expect(engines.verifyStynxBoundary).not.toHaveBeenCalled();
  });

  it('maps forbidden, undeclared-seam and absent-seam violations', async () => {
    engines.readBoundaryConfig.mockReturnValue({ source: '.stynxrc.json', config: {} });
    engines.verifyStynxBoundary.mockReturnValue({
      roots: ['domain'],
      scanned: ['domain/a.ts', 'domain/b.ts'],
      seams: ['@stynx-nyx/core'],
      violations: [
        {
          kind: 'forbidden',
          file: 'domain/a.ts',
          line: 3,
          specifier: '@stynx-nyx/core/src/x',
          message: '',
        },
        {
          kind: 'undeclared-seam',
          file: 'domain/b.ts',
          line: 1,
          specifier: '@stynx-nyx/data',
          message: '',
        },
        {
          kind: 'missing-seam',
          file: 'package.json',
          line: 1,
          specifier: '@stynx-nyx/auth',
          message: '',
        },
      ],
    });
    const report = await runCheck('verify-stynx-boundary', {}, consumer());
    expect(report.status).toBe('FAIL');
    expect(report.counts).toEqual({ expected: 2, observed: 2, evaluated: 2 });
    expect(report.findings).toEqual([
      {
        locator: 'domain/a.ts:3',
        message: 'imports forbidden @stynx-nyx/core/src/x',
        standard: 'S-44',
        hint: 'import the public entry point',
      },
      {
        locator: 'domain/b.ts:1',
        message: 'imports undeclared STYNX seam @stynx-nyx/data',
        standard: 'S-34',
        hint: 'add it to .stynxrc.json allowedPackages or import the barrel',
      },
      {
        locator: 'package.json:1',
        message: 'required STYNX package seam is absent: @stynx-nyx/auth',
        standard: 'S-34',
        hint: 'add it to .stynxrc.json allowedPackages or import the barrel',
      },
    ]);
    expect(report).toMatchObject({ config: '.stynxrc.json', seams: ['@stynx-nyx/core'] });
  });

  it('passes when no violations are found', async () => {
    engines.readBoundaryConfig.mockReturnValue({ source: '.stynxrc.json', config: {} });
    engines.verifyStynxBoundary.mockReturnValue({
      roots: [],
      scanned: [],
      seams: [],
      violations: [],
    });
    const report = await runCheck('verify-stynx-boundary', {}, consumer());
    expect(report).toMatchObject({ status: 'PASS', findings: [], counts: { observed: 0 } });
  });
});

describe('verify-api-coverage', () => {
  const openapi = `{
  "openapi": "3.1.0",
  "paths": {
    "/notes": {},
    "/notes/{id}": {}
  }
}
`;

  it('locates drift in source operations or the document and fails only when strict', async () => {
    const root = consumer({ 'docs/openapi.json': openapi });
    engines.verifyApiCoverage.mockReturnValue({
      drift: true,
      openapiPath: join(root, 'docs/openapi.json'),
      operations: [
        { method: 'get', path: '/notes', source: 'src/notes.controller.ts', sourceLine: 12 },
        { method: 'post', path: '/notes', source: 'src/notes.controller.ts', sourceLine: 20 },
        { method: 'get', path: '/archived', source: 'src/archived.controller.ts', sourceLine: 4 },
      ],
      summary: {
        ...emptySummary,
        implementedOperations: 3,
        missingInOpenApi: [{ path: '/archived' }, { path: '/ghost' }],
        missingInCode: [{ path: '/notes/{id}' }],
        parameterNameMismatches: [
          { openapiPath: '/notes/{id}', openapiParam: 'id', routeParam: 'noteId' },
        ],
        operationDrift: [
          { method: 'POST', path: '/notes', reason: 'response-schema-mismatch' },
          { method: 'DELETE', path: '/notes', reason: 'operation-missing' },
          { reason: 'document-identity-mismatch' },
        ],
        compositionDrift: [{ compositionId: 'notes-feed', reason: 'composition-missing' }],
      },
    });
    const strict = await runCheck('verify-api-coverage', { strict: true }, root);
    expect(strict.status).toBe('FAIL');
    expect(strict.counts).toEqual({ expected: 3, observed: 3, evaluated: 3 });
    expect(
      strict.findings.map(({ locator, message, standard }) => [locator, message, standard]),
    ).toEqual([
      ['src/archived.controller.ts:4', '/archived operation not in docs/openapi.json', 'S-22'],
      ['docs/openapi.json:1', '/ghost operation not in docs/openapi.json', 'S-22'],
      ['docs/openapi.json:5', '/notes/{id} documented but not implemented', 'S-22'],
      [
        'docs/openapi.json:5',
        '/notes/{id} parameter id differs from route parameter noteId',
        'S-22',
      ],
      ['src/notes.controller.ts:20', 'POST /notes response-schema-mismatch', 'S-45'],
      ['docs/openapi.json:4', 'DELETE /notes operation-missing', 'S-45'],
      ['docs/openapi.json:1', 'document-identity-mismatch', 'S-45'],
      ['docs/openapi.json:1', 'composition notes-feed: composition-missing', 'S-45'],
    ]);
    expect(exitCodeFor(strict)).toBe(1);

    const reported = await runCheck('verify-api-coverage', {}, root);
    expect(reported).toMatchObject({ status: 'PASS', strict: false });
    expect(reported.findings).toHaveLength(8);
  });

  it('falls back to line 1 when the OpenAPI document does not exist', async () => {
    const root = consumer();
    engines.verifyApiCoverage.mockReturnValue({
      drift: false,
      openapiPath: join(root, 'docs/openapi.json'),
      operations: [],
      summary: { ...emptySummary, missingInCode: [{ path: '/notes' }] },
    });
    const report = await runCheck('verify-api-coverage', { strict: true }, root);
    expect(report.status).toBe('PASS');
    expect(report.findings[0]?.locator).toBe('docs/openapi.json:1');
  });
});

describe('verify-openapi-contract', () => {
  it('locates operation failures by path and document failures at the resolved line', async () => {
    const root = consumer({
      ...stynxrc({
        apiCoverage: { openapiPath: 'api/openapi.json' },
        openapiContract: { genericResponseAllowlistPath: 'api/allow.json' },
      }),
      'api/openapi.json': '{}\n',
    });
    const lineOf = vi.fn((path: string | undefined) => (path === '/notes' ? 9 : 1));
    engines.verifyOpenApiContract.mockReturnValue({
      paths: 1,
      operations: 2,
      failures: ['GET /notes: missing operationId', 'document has no info.title'],
      lineOf,
    });
    const report = await runCheck('verify-openapi-contract', {}, root);
    expect(engines.verifyOpenApiContract).toHaveBeenCalledWith({
      root,
      openapiPath: 'api/openapi.json',
      genericResponseAllowlistPath: 'api/allow.json',
    });
    expect(lineOf).toHaveBeenCalledWith(undefined);
    expect(report).toMatchObject({
      status: 'FAIL',
      openapiPath: 'api/openapi.json',
      paths: 1,
      counts: { expected: 2, observed: 2, evaluated: 2 },
    });
    expect(report.findings).toEqual([
      {
        locator: 'api/openapi.json:9',
        message: 'GET /notes: missing operationId',
        standard: 'S-23',
        hint: 'fix the controller contract and rerun the write pair',
      },
      {
        locator: 'api/openapi.json:1',
        message: 'document has no info.title',
        standard: 'S-23',
        hint: 'fix the controller contract and rerun the write pair',
      },
    ]);
  });

  it('passes a clean document with no allowlist configured', async () => {
    const root = consumer({ 'docs/framework/contracts/openapi.json': '{}\n' });
    engines.verifyOpenApiContract.mockReturnValue({
      paths: 0,
      operations: 0,
      failures: [],
      lineOf: () => 1,
    });
    const report = await runCheck('verify-openapi-contract', {}, root);
    expect(report).toMatchObject({ status: 'PASS', counts: { observed: 0 }, findings: [] });
    expect(engines.verifyOpenApiContract).toHaveBeenCalledWith(
      expect.objectContaining({ genericResponseAllowlistPath: undefined }),
    );
  });
});

describe('verify-public-api-baselines', () => {
  const sdk = { name: '@consumer/sdk', dir: 'packages/sdk' };

  it('passes a zero-package consumer without a baseline file (observed 0)', async () => {
    engines.discoverPackages.mockReturnValue([]);
    const root = consumer();
    const report = await runCheck('verify-public-api-baselines', {}, root);
    expect(engines.discoverPackages).toHaveBeenCalledWith(root, ['packages', 'packages-web']);
    expect(report).toMatchObject({
      status: 'PASS',
      counts: { expected: 0, observed: 0, evaluated: 0 },
      baselinePath: 'docs/framework/contracts/public-api-baselines.json',
      packages: [],
    });
    expect(exitCodeFor(report)).toBe(0);
  });

  it('fails when packages exist but the configured baseline is missing', async () => {
    engines.discoverPackages.mockReturnValue([sdk]);
    const root = consumer(
      stynxrc({ publicApi: { baselinePath: 'api/baselines.json', packageRoots: ['libs'] } }),
    );
    const report = await runCheck('verify-public-api-baselines', {}, root);
    expect(engines.discoverPackages).toHaveBeenCalledWith(root, ['libs']);
    expect(report).toMatchObject({
      status: 'FAIL',
      packages: ['@consumer/sdk'],
      findings: [{ locator: 'api/baselines.json:1', message: 'public-API baseline is missing' }],
    });
  });

  it('locates each failure at its package key in the baseline document', async () => {
    const baseline = `{
  "packages": {
    "@consumer/sdk": {}
  }
}
`;
    const root = consumer({ 'docs/framework/contracts/public-api-baselines.json': baseline });
    engines.discoverPackages.mockReturnValue([sdk]);
    engines.currentBaselines.mockReturnValue({ packages: {} });
    engines.compareBaselines.mockReturnValue([
      '@consumer/sdk: public declaration changed index.d.ts',
      'baseline lists an unknown package @consumer/gone',
    ]);
    const report = await runCheck('verify-public-api-baselines', {}, root);
    expect(engines.compareBaselines).toHaveBeenCalledWith(
      { packages: { '@consumer/sdk': {} } },
      { packages: {} },
      [sdk],
    );
    expect(report.status).toBe('FAIL');
    expect(report.findings.map((finding) => finding.locator)).toEqual([
      'docs/framework/contracts/public-api-baselines.json:3',
      'docs/framework/contracts/public-api-baselines.json:1',
    ]);
  });

  it('passes when the baselines match', async () => {
    const root = consumer({ 'docs/framework/contracts/public-api-baselines.json': '{}\n' });
    engines.discoverPackages.mockReturnValue([sdk]);
    engines.currentBaselines.mockReturnValue({ packages: {} });
    engines.compareBaselines.mockReturnValue([]);
    const report = await runCheck('verify-public-api-baselines', {}, root);
    expect(report).toMatchObject({ status: 'PASS', findings: [], counts: { observed: 1 } });
  });

  it('rejects packageRoots that are not a list of strings as config-invalid', async () => {
    for (const packageRoots of ['packages', ['packages', 7]]) {
      const root = consumer(stynxrc({ publicApi: { packageRoots } }));
      const report = await runCheck('verify-public-api-baselines', {}, root);
      expect(report).toMatchObject({
        status: 'UNKNOWN',
        reason: 'config-invalid',
        findings: [
          {
            locator: '.stynxrc.json:1',
            message: '.stynxrc.json publicApi.packageRoots must be a list of strings',
          },
        ],
      });
    }
    expect(engines.discoverPackages).not.toHaveBeenCalled();
  });
});

describe('verify-rls-negative', () => {
  it('passes configured runtime evidence and coverage to the engine and maps failures', async () => {
    const root = consumer(
      stynxrc({
        rlsNegative: {
          runtimeDir: 'test/rls',
          coveragePath: 'test/rls/coverage.json',
          runtimeEvidence: [{ label: 'denied', pattern: 'permission denied' }],
        },
      }),
      ['db/ddl'],
    );
    engines.verifyRlsNegative.mockReturnValue({
      files: ['db/ddl/01.sql'],
      tables: ['notes.note', 'notes.tag'],
      failures: [
        { message: 'notes.tag: missing FORCE ROW LEVEL SECURITY', locator: 'db/ddl/01.sql:8' },
        { message: 'notes.note: no negative evidence', locator: null },
      ],
    });
    const report = await runCheck('verify-rls-negative', { ddl: 'db/ddl' }, root);
    const call = engines.verifyRlsNegative.mock.calls[0]?.[0] as {
      runtimeEvidence: Array<[string, RegExp]>;
    };
    expect(call).toMatchObject({
      root,
      ddlRoots: ['db/ddl'],
      runtimeDir: 'test/rls',
      coveragePath: 'test/rls/coverage.json',
      coverageRequired: true,
    });
    expect(call.runtimeEvidence[0]?.[0]).toBe('denied');
    expect(call.runtimeEvidence[0]?.[1].test('ERROR: Permission Denied for table')).toBe(true);
    expect(report).toMatchObject({
      status: 'FAIL',
      counts: { expected: 2, observed: 2, evaluated: 2 },
      ddl: ['db/ddl'],
      tables: ['notes.note', 'notes.tag'],
    });
    expect(report.findings).toEqual([
      {
        locator: 'db/ddl/01.sql:8',
        message: 'notes.tag: missing FORCE ROW LEVEL SECURITY',
        standard: 'S-02',
        hint: 'add ENABLE and FORCE ROW LEVEL SECURITY in the same file',
      },
      {
        locator: 'test/rls:1',
        message: 'notes.note: no negative evidence',
        standard: 'S-02',
        hint: 'add the tenant policy or the negative evidence',
      },
    ]);
  });

  it('defaults the runtime locator and treats non-list evidence as none', async () => {
    const root = consumer(stynxrc({ rlsNegative: { runtimeEvidence: 'denied' } }));
    engines.verifyRlsNegative.mockReturnValue({
      files: [],
      tables: ['notes.note'],
      failures: [{ message: 'notes.note: no negative evidence', locator: null }],
    });
    const report = await runCheck('verify-rls-negative', {}, root);
    expect(engines.verifyRlsNegative).toHaveBeenCalledWith({
      root,
      ddlRoots: [],
      runtimeDir: null,
      runtimeEvidence: [],
      coveragePath: null,
      coverageRequired: false,
    });
    expect(report.findings[0]?.locator).toBe('test/db/runtime:1');
  });

  it('passes a zero-table run with observed 0', async () => {
    engines.verifyRlsNegative.mockReturnValue({ files: [], tables: [], failures: [] });
    const report = await runCheck('verify-rls-negative', {}, consumer());
    expect(report).toMatchObject({ status: 'PASS', counts: { observed: 0 }, findings: [] });
    expect(exitCodeFor(report)).toBe(0);
  });

  it('rejects malformed runtime evidence entries as config-invalid', async () => {
    for (const entry of [null, { label: 'denied' }, { label: 1, pattern: 'x' }]) {
      const root = consumer(stynxrc({ rlsNegative: { runtimeEvidence: [entry] } }));
      const report = await runCheck('verify-rls-negative', {}, root);
      expect(report).toMatchObject({
        status: 'UNKNOWN',
        reason: 'config-invalid',
        findings: [
          {
            locator: '.stynxrc.json:1',
            message: '.stynxrc.json rlsNegative.runtimeEvidence entries need label and pattern',
          },
        ],
      });
    }
    expect(engines.verifyRlsNegative).not.toHaveBeenCalled();
  });
});

describe('.stynxrc.json validation', () => {
  it('rejects non-object documents and unparsable JSON as config-invalid', async () => {
    for (const text of ['[]\n', 'null\n', '"text"\n', '{ not json']) {
      const root = consumer({ '.stynxrc.json': text });
      const report = await runCheck('verify-openapi-contract', {}, root);
      expect(report).toMatchObject({ status: 'UNKNOWN', reason: 'config-invalid' });
      expect(report.findings[0]?.locator).toBe('.stynxrc.json:1');
      expect(exitCodeFor(report)).toBe(2);
    }
    expect(engines.verifyOpenApiContract).not.toHaveBeenCalled();
  });

  it('ignores a section that is not an object', async () => {
    const root = consumer(stynxrc({ rlsNegative: ['runtimeDir'] }));
    engines.verifyRlsNegative.mockReturnValue({ files: [], tables: [], failures: [] });
    const report = await runCheck('verify-rls-negative', {}, root);
    expect(report.status).toBe('PASS');
    expect(engines.verifyRlsNegative).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeDir: null, coveragePath: null }),
    );
  });
});

describe('engine errors', () => {
  it('reports declarations-missing as prerequisite-failed with or without a locator', async () => {
    engines.discoverPackages.mockImplementationOnce(() => {
      throw Object.assign(new Error('declarations not built'), {
        code: 'declarations-missing',
        locator: 'packages/sdk/package.json:1',
      });
    });
    const located = await runCheck('verify-public-api-baselines', {}, consumer());
    expect(located).toMatchObject({
      status: 'UNKNOWN',
      reason: 'prerequisite-failed',
      findings: [
        {
          locator: 'packages/sdk/package.json:1',
          message: 'declarations not built',
          hint: 'build the packages first',
        },
      ],
    });

    engines.discoverPackages.mockImplementationOnce(() => {
      throw Object.assign(new Error('declarations not built'), { code: 'declarations-missing' });
    });
    const unlocated = await runCheck('verify-public-api-baselines', {}, consumer());
    expect(unlocated.findings[0]?.locator).toBe('package.json:1');
  });

  it('turns a located declaration error on an existing file into a FAIL finding', async () => {
    const root = consumer({ 'src/notes.controller.ts': 'export {};\n' });
    engines.inventoryRoutes.mockImplementation(() => {
      throw new Error(`${join(root, 'src/notes.controller.ts')}:5:3: computed route selector x()`);
    });
    const report = await runCheck('list-routes', { roots: 'src' }, root);
    expect(report).toMatchObject({
      status: 'FAIL',
      findings: [
        {
          locator: 'src/notes.controller.ts:5',
          message: 'computed route selector x() (not statically readable)',
          standard: 'S-25',
        },
      ],
    });
    expect(report.reason).toBe(undefined);
    expect(exitCodeFor(report)).toBe(1);
  });

  it('reports other crashes, thrown non-errors and located errors on absent files as runner-crashed', async () => {
    const thrown: unknown[] = [
      new Error('src/absent.ts:5: cannot read'),
      new Error('engine exploded'),
      'plain string failure',
      null,
    ];
    for (const value of thrown) {
      engines.inventoryRoutes.mockImplementationOnce(() => {
        throw value;
      });
      const report = await runCheck('list-routes', { roots: 'src' }, consumer());
      expect(report).toMatchObject({
        status: 'UNKNOWN',
        reason: 'runner-crashed',
        findings: [
          { locator: '.:1', message: value instanceof Error ? value.message : String(value) },
        ],
      });
      expect(exitCodeFor(report)).toBe(2);
    }
  });
});
