import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * The six read-only check entry points (D-057; DEVAI v3 08 B.9, B.16, B.17, B.19, B.20).
 * Each reads a consumer root (the working directory), never writes, and returns one report:
 * exit 0 PASS, 1 a demonstrated violation (FAIL), 2 could not run or observe (UNKNOWN).
 */
export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface CheckFinding {
  /** `<path>:<line>`, relative to the consumer root. */
  locator: string;
  message: string;
  standard?: string;
  hint?: string;
}

export interface CheckReport {
  schemaVersion: '1';
  command: CheckCommandName;
  status: CheckStatus;
  reason?: string;
  counts: { expected: number; observed: number; evaluated: number };
  findings: CheckFinding[];
  [detail: string]: unknown;
}

export const checkCommandNames = [
  'list-routes',
  'verify-stynx-boundary',
  'verify-api-coverage',
  'verify-openapi-contract',
  'verify-public-api-baselines',
  'verify-rls-negative',
] as const;

export type CheckCommandName = (typeof checkCommandNames)[number];

export interface CheckOptions {
  /** list-routes: comma-separated roots; a `*` segment matches one directory level. */
  roots?: string;
  /** verify-rls-negative: comma-separated DDL roots or files, same pattern syntax. */
  ddl?: string;
  /** verify-api-coverage: drift is a failure (otherwise reported only). */
  strict?: boolean;
}

/** Template layout (DEVAI v3 02 §1): module APIs and apps. */
export const defaultRouteRoots = 'domain/*/api/src,apps/*/src';
export const defaultDdlRoots = 'database/ddl';

const defaultOpenApiPath = 'docs/framework/contracts/openapi.json';
const defaultBaselinePath = 'docs/framework/contracts/public-api-baselines.json';

export function exitCodeFor(report: Pick<CheckReport, 'status'>): 0 | 1 | 2 {
  if (report.status === 'PASS') return 0;
  return report.status === 'FAIL' ? 1 : 2;
}

export function formatCheckText(report: CheckReport): string {
  const head = `${report.command}: ${report.status}${report.reason ? ` (${report.reason})` : ''} observed ${report.counts.observed}/${report.counts.expected}`;
  const lines = report.findings.map(
    (finding) =>
      `${finding.locator} ${finding.message}${finding.standard ? ` [${finding.standard}]` : ''}${finding.hint ? ` ${finding.hint}` : ''}`,
  );
  return `${[head, ...lines].join('\n')}\n`;
}

export async function runCheck(
  command: CheckCommandName,
  options: CheckOptions = {},
  root: string = process.cwd(),
): Promise<CheckReport> {
  const consumerRoot = resolve(root);
  try {
    switch (command) {
      case 'list-routes':
        return await listRoutes(consumerRoot, options.roots ?? defaultRouteRoots);
      case 'verify-stynx-boundary':
        return await verifyBoundary(consumerRoot);
      case 'verify-api-coverage':
        return await verifyApiCoverage(consumerRoot, options.strict === true);
      case 'verify-openapi-contract':
        return await verifyOpenApiContract(consumerRoot);
      case 'verify-public-api-baselines':
        return await verifyPublicApiBaselines(consumerRoot);
      case 'verify-rls-negative':
        return await verifyRlsNegative(consumerRoot, options.ddl ?? defaultDdlRoots);
    }
  } catch (error) {
    return failureFromError(command, consumerRoot, error);
  }
}

// ---------------------------------------------------------------------------------------------
// Engines: plain ESM modules shipped in the package's `engines/` directory and shared with the
// STYNX repository scripts, so the published entry point and `pnpm api:*` run the same code.

interface ListRoutesEngine {
  inventoryRoutes(options: { repoRoot: string; scanRoots: string[] }): {
    scanned: string[];
    routes: Array<{
      package: string;
      controller: string;
      method: string;
      path: string;
      permissions: string;
      rateLimitClass: string;
      file: string;
      handler: string;
      position: { line: number };
    }>;
    findings: CheckFinding[];
  };
}

interface BoundaryViolation {
  kind: string;
  file: string;
  line: number;
  specifier: string;
  message: string;
}

interface BoundaryEngine {
  readBoundaryConfig(root: string): { source: string; config: Record<string, unknown> } | null;
  verifyStynxBoundary(
    root: string,
    config: Record<string, unknown>,
  ): { roots: string[]; scanned: string[]; seams: string[]; violations: BoundaryViolation[] };
}

interface CoverageOperation {
  method: string;
  path: string;
  source: string;
  sourceLine: number;
}

interface CoverageDrift {
  method?: string;
  path?: string;
  reason: string;
  compositionId?: string;
}

interface CoverageSummary {
  openapiPath: string | null;
  openapiPaths: number;
  implementedOperations: number;
  implementedRoutes: number;
  parameterNameMismatches: Array<{ openapiPath: string; openapiParam: string; routeParam: string }>;
  missingInCode: Array<{ path: string }>;
  missingInOpenApi: Array<{ path: string }>;
  operationDrift: CoverageDrift[];
  compositionDrift: CoverageDrift[];
}

interface ApiCoverageEngine {
  verifyApiCoverage(options: { root: string }): {
    summary: CoverageSummary;
    drift: boolean;
    operations: CoverageOperation[];
    openapiPath: string;
  };
}

interface OpenApiContractEngine {
  verifyOpenApiContract(options: {
    root: string;
    openapiPath?: string;
    genericResponseAllowlistPath?: string | undefined;
  }): {
    paths: number;
    operations: number;
    failures: string[];
    lineOf(path: string | undefined): number;
  };
}

interface PackageSpec {
  name: string;
  dir: string;
}

interface Baselines {
  packages: Record<string, unknown>;
}

interface PublicApiEngine {
  discoverPackages(root: string, packageRoots: string[]): PackageSpec[];
  currentBaselines(root: string, specs: PackageSpec[]): Baselines;
  compareBaselines(expected: Baselines, current: Baselines, specs: PackageSpec[]): string[];
}

interface RlsEngine {
  verifyRlsNegative(options: {
    root: string;
    ddlRoots: string[];
    runtimeDir?: string | null;
    runtimeEvidence?: Array<[string, RegExp]>;
    coveragePath?: string | null;
    coverageRequired?: boolean;
  }): {
    files: string[];
    tables: string[];
    failures: Array<{ message: string; locator: string | null }>;
  };
}

const engineDirectory = locateEngines(dirname(fileURLToPath(import.meta.url)));

async function loadEngine<T>(name: string): Promise<T> {
  return (await import(pathToFileURL(join(engineDirectory, `${name}.mjs`)).href)) as T;
}

function locateEngines(start: string): string {
  // src/ during tests, dist/cli/src/ once built and published: the package root holds engines/.
  for (let dir = start, depth = 0; depth < 6; dir = dirname(dir), depth += 1) {
    const candidate = join(dir, 'engines');
    if (existsSync(join(candidate, 'list-routes.mjs')) && existsSync(join(dir, 'package.json')))
      return candidate;
  }
  throw new Error(`@stynx-nyx/cli engines directory not found above ${start}`);
}

// ---------------------------------------------------------------------------------------------

async function listRoutes(root: string, rootsOption: string): Promise<CheckReport> {
  const engine = await loadEngine<ListRoutesEngine>('list-routes');
  const patterns = splitList(rootsOption);
  const scanRoots = expandPatterns(root, patterns);
  const inventory = engine.inventoryRoutes({ repoRoot: root, scanRoots });
  const failedFiles = new Set(inventory.findings.map((finding) => finding.locator.split(':')[0]));
  const findings = inventory.findings.map((finding) => ({
    ...finding,
    standard: 'S-25',
    hint: 'use literal decorator arguments',
  }));
  return report(
    'list-routes',
    findings.length ? 'FAIL' : 'PASS',
    findings,
    {
      expected: inventory.scanned.length,
      observed: inventory.scanned.length - failedFiles.size,
      evaluated: inventory.scanned.length - failedFiles.size,
    },
    {
      roots: patterns,
      resolvedRoots: scanRoots,
      scanned: inventory.scanned,
      routes: inventory.routes.map((route) => ({
        package: route.package,
        controller: route.controller,
        handler: route.handler,
        method: route.method,
        path: route.path,
        permissions: route.permissions,
        rateLimitClass: route.rateLimitClass,
        locator: `${portable(route.file)}:${route.position.line}`,
      })),
    },
  );
}

async function verifyBoundary(root: string): Promise<CheckReport> {
  const engine = await loadEngine<BoundaryEngine>('stynx-boundary');
  const configured = engine.readBoundaryConfig(root);
  if (!configured) {
    return report(
      'verify-stynx-boundary',
      'FAIL',
      [
        {
          locator: '.stynxrc.json:1',
          message: '.stynxrc.json is missing; the boundary is undeclared',
          standard: 'S-34',
          hint: 'add .stynxrc.json with a boundary block (roots, allowedPackages)',
        },
      ],
      { expected: 0, observed: 0, evaluated: 0 },
      { config: null, scanned: [] },
    );
  }
  const result = engine.verifyStynxBoundary(root, configured.config);
  const findings = result.violations.map((violation) => ({
    locator: `${portable(violation.file)}:${violation.line}`,
    message:
      violation.kind === 'forbidden'
        ? `imports forbidden ${violation.specifier}`
        : violation.kind === 'undeclared-seam'
          ? `imports undeclared STYNX seam ${violation.specifier}`
          : `required STYNX package seam is absent: ${violation.specifier}`,
    standard: violation.kind === 'forbidden' ? 'S-44' : 'S-34',
    hint:
      violation.kind === 'forbidden'
        ? 'import the public entry point'
        : 'add it to .stynxrc.json allowedPackages or import the barrel',
  }));
  const count = result.scanned.length;
  return report(
    'verify-stynx-boundary',
    findings.length ? 'FAIL' : 'PASS',
    findings,
    { expected: count, observed: count, evaluated: count },
    {
      config: configured.source,
      roots: result.roots,
      scanned: result.scanned,
      seams: result.seams,
    },
  );
}

async function verifyApiCoverage(root: string, strict: boolean): Promise<CheckReport> {
  const engine = await loadEngine<ApiCoverageEngine>('api-coverage');
  const { summary, drift, operations, openapiPath } = engine.verifyApiCoverage({ root });
  const documentPath = portable(relative(root, openapiPath));
  const documentText = existsSync(openapiPath) ? readFileSync(openapiPath, 'utf8') : '';
  const atDocument = (path?: string) => `${documentPath}:${jsonKeyLine(documentText, path)}`;
  const atOperation = (method: string | undefined, path: string | undefined) => {
    const operation = operations.find(
      (candidate) =>
        candidate.path === path && (!method || candidate.method.toUpperCase() === method),
    );
    return operation ? `${portable(operation.source)}:${operation.sourceLine}` : atDocument(path);
  };
  const hint = 'run the write pair (api:docs:write) in a generate packet';
  const findings: CheckFinding[] = [
    ...summary.missingInOpenApi.map(({ path }) => ({
      locator: atOperation(undefined, path),
      message: `${path} operation not in ${documentPath}`,
      standard: 'S-22',
      hint,
    })),
    ...summary.missingInCode.map(({ path }) => ({
      locator: atDocument(path),
      message: `${path} documented but not implemented`,
      standard: 'S-22',
      hint,
    })),
    ...summary.parameterNameMismatches.map((mismatch) => ({
      locator: atDocument(mismatch.openapiPath),
      message: `${mismatch.openapiPath} parameter ${mismatch.openapiParam} differs from route parameter ${mismatch.routeParam}`,
      standard: 'S-22',
      hint,
    })),
    ...[...summary.operationDrift, ...summary.compositionDrift].map((failure) => ({
      locator: failure.path ? atOperation(failure.method, failure.path) : atDocument(),
      message: `${failure.compositionId ? `composition ${failure.compositionId}: ` : ''}${failure.method && failure.path ? `${failure.method} ${failure.path} ` : ''}${failure.reason}`,
      standard: 'S-45',
      hint,
    })),
  ];
  const count = summary.implementedOperations;
  return report(
    'verify-api-coverage',
    strict && drift ? 'FAIL' : 'PASS',
    findings,
    { expected: count, observed: count, evaluated: count },
    { strict, summary },
  );
}

async function verifyOpenApiContract(root: string): Promise<CheckReport> {
  const engine = await loadEngine<OpenApiContractEngine>('openapi-contract');
  const config = readStynxrc(root);
  const openapiPath = stringAt(config, 'apiCoverage', 'openapiPath') ?? defaultOpenApiPath;
  if (!existsSync(resolve(root, openapiPath))) {
    return report(
      'verify-openapi-contract',
      'FAIL',
      [
        {
          locator: `${openapiPath}:1`,
          message: 'OpenAPI document is missing',
          standard: 'S-22',
          hint: 'run the write pair (api:docs:write) in a generate packet',
        },
      ],
      { expected: 1, observed: 0, evaluated: 0 },
      { openapiPath },
    );
  }
  const result = engine.verifyOpenApiContract({
    root,
    openapiPath,
    genericResponseAllowlistPath:
      stringAt(config, 'openapiContract', 'genericResponseAllowlistPath') ?? undefined,
  });
  const findings = result.failures.map((failure) => {
    const operation = failure.match(/^([A-Z]+) (\S+): (.*)$/su);
    return {
      locator: `${openapiPath}:${result.lineOf(operation?.[2])}`,
      message: failure,
      standard: 'S-23',
      hint: 'fix the controller contract and rerun the write pair',
    };
  });
  return report(
    'verify-openapi-contract',
    findings.length ? 'FAIL' : 'PASS',
    findings,
    { expected: result.operations, observed: result.operations, evaluated: result.operations },
    { openapiPath, paths: result.paths },
  );
}

async function verifyPublicApiBaselines(root: string): Promise<CheckReport> {
  const engine = await loadEngine<PublicApiEngine>('public-api-baselines');
  const config = readStynxrc(root);
  const baselinePath = stringAt(config, 'publicApi', 'baselinePath') ?? defaultBaselinePath;
  const packageRoots = stringListAt(config, 'publicApi', 'packageRoots') ?? [
    'packages',
    'packages-web',
  ];
  const specs = engine.discoverPackages(root, packageRoots);
  const detail = { baselinePath, packages: specs.map((spec) => spec.name) };
  const counts = { expected: specs.length, observed: specs.length, evaluated: specs.length };
  const absoluteBaseline = resolve(root, baselinePath);
  if (!existsSync(absoluteBaseline)) {
    if (specs.length === 0)
      return report('verify-public-api-baselines', 'PASS', [], counts, detail);
    return report(
      'verify-public-api-baselines',
      'FAIL',
      [
        {
          locator: `${baselinePath}:1`,
          message: 'public-API baseline is missing',
          standard: 'S-40',
          hint: 'write the baselines in a generate packet',
        },
      ],
      counts,
      detail,
    );
  }
  const baselineText = readFileSync(absoluteBaseline, 'utf8');
  const expected = JSON.parse(baselineText) as Baselines;
  const failures = engine.compareBaselines(expected, engine.currentBaselines(root, specs), specs);
  const findings = failures.map((failure) => ({
    locator: `${baselinePath}:${jsonKeyLine(baselineText, specs.find((spec) => failure.startsWith(`${spec.name}:`))?.name)}`,
    message: failure,
    standard: 'S-40',
    hint: 'a breaking change needs a major changeset; rebind the baselines in a generate packet',
  }));
  return report(
    'verify-public-api-baselines',
    findings.length ? 'FAIL' : 'PASS',
    findings,
    counts,
    detail,
  );
}

async function verifyRlsNegative(root: string, ddlOption: string): Promise<CheckReport> {
  const engine = await loadEngine<RlsEngine>('rls-negative');
  const config = readStynxrc(root);
  const patterns = splitList(ddlOption);
  const ddlRoots = expandPatterns(root, patterns);
  const runtimeDir = stringAt(config, 'rlsNegative', 'runtimeDir');
  const coveragePath = stringAt(config, 'rlsNegative', 'coveragePath');
  const evidence = objectAt(config, 'rlsNegative')?.['runtimeEvidence'];
  const runtimeEvidence: Array<[string, RegExp]> = Array.isArray(evidence)
    ? evidence.map((entry: unknown) => {
        const { label, pattern } = (entry ?? {}) as { label?: unknown; pattern?: unknown };
        if (typeof label !== 'string' || typeof pattern !== 'string')
          throw new ConfigError(
            '.stynxrc.json rlsNegative.runtimeEvidence entries need label and pattern',
          );
        return [label, new RegExp(pattern, 'iu')];
      })
    : [];
  const result = engine.verifyRlsNegative({
    root,
    ddlRoots,
    runtimeDir,
    runtimeEvidence,
    coveragePath,
    coverageRequired: coveragePath !== null,
  });
  const findings = result.failures.map((failure) => ({
    locator: failure.locator ?? `${runtimeDir ?? 'test/db/runtime'}:1`,
    message: failure.message,
    standard: 'S-02',
    hint: failure.message.includes('ROW LEVEL SECURITY')
      ? 'add ENABLE and FORCE ROW LEVEL SECURITY in the same file'
      : 'add the tenant policy or the negative evidence',
  }));
  return report(
    'verify-rls-negative',
    findings.length ? 'FAIL' : 'PASS',
    findings,
    {
      expected: result.tables.length,
      observed: result.tables.length,
      evaluated: result.tables.length,
    },
    { ddl: patterns, resolvedDdl: ddlRoots, files: result.files, tables: result.tables },
  );
}

// ---------------------------------------------------------------------------------------------

class ConfigError extends Error {}

function report(
  command: CheckCommandName,
  status: CheckStatus,
  findings: CheckFinding[],
  counts: CheckReport['counts'],
  detail: Record<string, unknown>,
  reason?: string,
): CheckReport {
  return {
    schemaVersion: '1',
    command,
    status,
    ...(reason ? { reason } : {}),
    counts,
    findings,
    ...detail,
  };
}

function failureFromError(command: CheckCommandName, root: string, error: unknown): CheckReport {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: unknown } | null)?.code;
  const counts = { expected: 0, observed: 0, evaluated: 0 };
  if (error instanceof ConfigError || error instanceof SyntaxError)
    return report(
      command,
      'UNKNOWN',
      [{ locator: '.stynxrc.json:1', message }],
      counts,
      {},
      'config-invalid',
    );
  if (code === 'declarations-missing') {
    const locator = (error as { locator?: unknown }).locator;
    return report(
      command,
      'UNKNOWN',
      [
        {
          locator: typeof locator === 'string' ? locator : 'package.json:1',
          message,
          hint: 'build the packages first',
        },
      ],
      counts,
      {},
      'prerequisite-failed',
    );
  }
  // A declaration the engines refuse to read carries `<file>:<line>`: a demonstrated violation.
  const [, file, line, detail] = message.match(/^(.*?):(\d+)(?::\d+)?: (.*)$/su) ?? [];
  if (file && line && detail && existsSync(resolve(root, file))) {
    return report(
      command,
      'FAIL',
      [
        {
          locator: `${portable(relative(root, resolve(root, file)))}:${line}`,
          message: `${detail} (not statically readable)`,
          standard: 'S-25',
          hint: 'use literal decorator arguments',
        },
      ],
      counts,
      {},
    );
  }
  return report(command, 'UNKNOWN', [{ locator: '.:1', message }], counts, {}, 'runner-crashed');
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Expands `*` path segments against directories under `root`; literal roots pass through. */
function expandPatterns(root: string, patterns: string[]): string[] {
  const expanded: string[] = [];
  for (const pattern of patterns) {
    let candidates = [''];
    for (const segment of pattern.split('/').filter(Boolean)) {
      if (segment === '*') {
        candidates = candidates.flatMap((candidate) => {
          const dir = resolve(root, candidate || '.');
          if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
          return readdirSync(dir, { withFileTypes: true })
            .filter(
              (entry) =>
                entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules',
            )
            .map((entry) => (candidate ? `${candidate}/${entry.name}` : entry.name))
            .sort((left, right) => left.localeCompare(right));
        });
      } else {
        candidates = candidates.map((candidate) =>
          candidate ? `${candidate}/${segment}` : segment,
        );
      }
    }
    for (const candidate of candidates)
      if (candidate && existsSync(resolve(root, candidate)) && !expanded.includes(candidate))
        expanded.push(candidate);
  }
  return expanded;
}

function readStynxrc(root: string): Record<string, unknown> {
  const path = join(root, '.stynxrc.json');
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ConfigError('.stynxrc.json must be a JSON object');
  return parsed as Record<string, unknown>;
}

function objectAt(config: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = config[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringAt(config: Record<string, unknown>, section: string, key: string): string | null {
  const value = objectAt(config, section)?.[key];
  if (value === undefined) return null;
  if (typeof value !== 'string')
    throw new ConfigError(`.stynxrc.json ${section}.${key} must be a string`);
  return value;
}

function stringListAt(
  config: Record<string, unknown>,
  section: string,
  key: string,
): string[] | null {
  const value = objectAt(config, section)?.[key];
  if (value === undefined) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new ConfigError(`.stynxrc.json ${section}.${key} must be a list of strings`);
  return value as string[];
}

function jsonKeyLine(text: string, key: string | undefined): number {
  if (!key) return 1;
  const index = text.indexOf(`${JSON.stringify(key)}:`);
  return index < 0 ? 1 : text.slice(0, index).split('\n').length;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}
