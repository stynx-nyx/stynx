import { z } from 'zod';
import { isRecord } from './value-validation.js';

const text = z.string();
const texts = z.array(text);
const count = z.number().int().nonnegative();
const object = z.record(text, z.unknown());
const finding = z.object({
  locator: text, message: text, standard: text.optional(), hint: text.optional(),
}).passthrough();
const packageSpecs = z.array(z.object({ name: text, dir: text }).passthrough());
const baselines = z.object({ packages: object }).passthrough();

function callable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

function invoke(engine: unknown, method: string, args: unknown[]): unknown {
  const fn = isRecord(engine) ? engine[method] : undefined;
  if (!callable(fn)) throw new Error(`Check engine is missing callable ${method}`);
  return fn(...args);
}

function checked<S extends z.ZodType>(schema: S, value: unknown, method: string): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Check engine returned invalid ${method} evidence`);
  return result.data;
}

const routeInventory = z.object({
  scanned: texts,
  routes: z.array(z.object({
    package: text, controller: text, method: text, path: text, permissions: text,
    rateLimitClass: text, file: text, handler: text,
    position: z.object({ line: count }).passthrough(),
  }).passthrough()),
  findings: z.array(finding),
}).passthrough();

export function listRoutesEngine(engine: unknown) {
  return {
    inventoryRoutes(options: { repoRoot: string; scanRoots: string[] }) {
      return checked(routeInventory, invoke(engine, 'inventoryRoutes', [options]), 'route inventory');
    },
  };
}

const boundaryConfig = z.object({ source: text, config: object }).passthrough().nullable();
const boundaryResult = z.object({
  roots: texts, scanned: texts, seams: texts,
  violations: z.array(z.object({
    kind: text, file: text, line: count, specifier: text, message: text,
  }).passthrough()),
}).passthrough();

export function boundaryEngine(engine: unknown) {
  return {
    readBoundaryConfig(root: string) {
      return checked(boundaryConfig, invoke(engine, 'readBoundaryConfig', [root]), 'boundary config');
    },
    verifyStynxBoundary(root: string, config: Record<string, unknown>) {
      return checked(boundaryResult, invoke(engine, 'verifyStynxBoundary', [root, config]), 'boundary');
    },
  };
}

const drift = z.object({
  method: text.optional(), path: text.optional(), reason: text, compositionId: text.optional(),
}).passthrough();
const coverageResult = z.object({
  summary: z.object({
    openapiPath: text.nullable(), openapiPaths: count, implementedOperations: count,
    implementedRoutes: count,
    parameterNameMismatches: z.array(z.object({
      openapiPath: text, openapiParam: text, routeParam: text,
    }).passthrough()),
    missingInCode: z.array(z.object({ path: text }).passthrough()),
    missingInOpenApi: z.array(z.object({ path: text }).passthrough()),
    operationDrift: z.array(drift), compositionDrift: z.array(drift),
  }).passthrough(),
  drift: z.boolean(),
  operations: z.array(z.object({
    method: text, path: text, source: text, sourceLine: count,
  }).passthrough()),
  openapiPath: text,
}).passthrough();

export function apiCoverageEngine(engine: unknown) {
  return {
    verifyApiCoverage(options: { root: string }) {
      return checked(coverageResult, invoke(engine, 'verifyApiCoverage', [options]), 'API coverage');
    },
  };
}

const openApiResult = z.object({ paths: count, operations: count, failures: texts }).passthrough();

export function openApiContractEngine(engine: unknown) {
  return {
    verifyOpenApiContract(options: {
      root: string; openapiPath?: string; genericResponseAllowlistPath?: string | undefined;
    }) {
      const result = checked(openApiResult, invoke(engine, 'verifyOpenApiContract', [options]), 'OpenAPI contract');
      const lineOf = result.lineOf;
      if (!callable(lineOf)) throw new Error('Check engine is missing callable lineOf');
      return {
        ...result,
        lineOf(path: string | undefined): number {
          return checked(count, lineOf(path), 'OpenAPI source line');
        },
      };
    },
  };
}

export function publicApiEngine(engine: unknown) {
  return {
    discoverPackages(root: string, packageRoots: string[]) {
      return checked(packageSpecs, invoke(engine, 'discoverPackages', [root, packageRoots]), 'package inventory');
    },
    currentBaselines(root: string, specs: z.output<typeof packageSpecs>) {
      return checked(baselines, invoke(engine, 'currentBaselines', [root, specs]), 'API baselines');
    },
    compareBaselines(expected: z.output<typeof baselines>, current: z.output<typeof baselines>, specs: z.output<typeof packageSpecs>) {
      return checked(texts, invoke(engine, 'compareBaselines', [expected, current, specs]), 'API baseline comparison');
    },
  };
}

const rlsResult = z.object({
  files: texts, tables: texts,
  failures: z.array(z.object({ message: text, locator: text.nullable() }).passthrough()),
}).passthrough();

export function rlsEngine(engine: unknown) {
  return {
    verifyRlsNegative(options: {
      root: string; ddlRoots: string[]; runtimeDir?: string | null;
      runtimeEvidence?: Array<[string, RegExp]>; coveragePath?: string | null;
      coverageRequired?: boolean;
    }) {
      return checked(rlsResult, invoke(engine, 'verifyRlsNegative', [options]), 'RLS evidence');
    },
  };
}
