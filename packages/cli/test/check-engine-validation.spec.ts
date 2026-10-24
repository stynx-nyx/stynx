import {
  apiCoverageEngine, boundaryEngine, listRoutesEngine, openApiContractEngine,
  publicApiEngine, rlsEngine,
} from '../src/check-engine-validation.js';

const routeOptions = { repoRoot: '/consumer', scanRoots: ['src'] };
const rootOptions = { root: '/consumer' };
const rlsOptions = { root: '/consumer', ddlRoots: ['database'] };
const cases: Array<{ name: string; method: string; invoke(module: unknown): unknown; invalid: unknown }> = [
  { name: 'routes', method: 'inventoryRoutes', invoke: (module) => listRoutesEngine(module).inventoryRoutes(routeOptions),
    invalid: { scanned: [], findings: [], routes: [{ package: 'pkg', controller: 'Controller', method: 'GET', path: '/', permissions: '', rateLimitClass: '', file: 'source.ts', handler: 'get', position: { line: 'private-invalid-line' } }] } },
  { name: 'boundary', method: 'verifyStynxBoundary', invoke: (module) => boundaryEngine(module).verifyStynxBoundary('/consumer', {}),
    invalid: { roots: [], scanned: [], seams: [], violations: [{ kind: 'dependency', file: 'file.ts', line: 1, specifier: 'private-specifier', message: 17 }] } },
  { name: 'coverage', method: 'verifyApiCoverage', invoke: (module) => apiCoverageEngine(module).verifyApiCoverage(rootOptions),
    invalid: { summary: {}, drift: false, operations: [], openapiPath: 'private-openapi' } },
  { name: 'OpenAPI', method: 'verifyOpenApiContract', invoke: (module) => openApiContractEngine(module).verifyOpenApiContract(rootOptions),
    invalid: { paths: 1, operations: -1, failures: [], lineOf: () => 1, private: 'private-envelope' } },
  { name: 'public API', method: 'discoverPackages', invoke: (module) => publicApiEngine(module).discoverPackages('/consumer', ['packages']),
    invalid: [{ name: 'private-package', dir: 17 }] },
  { name: 'RLS', method: 'verifyRlsNegative', invoke: (module) => rlsEngine(module).verifyRlsNegative(rlsOptions),
    invalid: { files: [], tables: [], failures: [{ message: 'private-failure', locator: 17 }] } },
];

for (const entry of cases) {
  describe(`${entry.name} engine boundary`, () => {
    it.each([null, 17, {}, { unrelated: () => ({}) }])('requires the named callable from an unknown module: %j', (module) => {
      expect(() => entry.invoke(module)).toThrow(`Check engine is missing callable ${entry.method}`);
    });
    it('rejects a malformed declared envelope without leaking its contents', () => {
      const method = vi.fn(() => entry.invalid);
      let error: unknown;
      try { entry.invoke({ [entry.method]: method }); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain('Check engine returned invalid');
      expect(String(error)).not.toContain('private-');
      expect(method).toHaveBeenCalledTimes(1);
    });
  });
}

it('retains valid route and boundary evidence extensions and exact invocation arguments', () => {
  const route = { package: 'pkg', controller: 'Controller', method: 'GET', path: '/', permissions: 'read', rateLimitClass: 'read', file: 'source.ts', handler: 'get', position: { line: 1, column: 9 }, extension: { opaque: true } };
  const routes = { scanned: ['source.ts'], routes: [route], findings: [{ locator: 'source.ts:1', message: 'message', standard: 'SM-01', hint: 'hint', extra: 7 }], extra: ['retained'] };
  const inventoryRoutes = vi.fn((_options: unknown) => routes);
  expect(listRoutesEngine({ inventoryRoutes }).inventoryRoutes(routeOptions)).toEqual(routes);
  expect(inventoryRoutes.mock.calls[0]?.[0]).toBe(routeOptions);
  const config = { allowedPackages: ['@consumer/'] };
  const result = { roots: ['src'], scanned: ['source.ts'], seams: ['public'], violations: [{ kind: 'dependency', file: 'source.ts', line: 1, specifier: 'private/module', message: 'message', extension: true }], extension: true };
  const verifyStynxBoundary = vi.fn((_root: string, _config: unknown) => result);
  const engine = boundaryEngine({ readBoundaryConfig: () => ({ source: '.stynxrc', config, extra: true }), verifyStynxBoundary });
  expect(engine.readBoundaryConfig('/consumer')).toEqual({ source: '.stynxrc', config, extra: true });
  expect(engine.verifyStynxBoundary('/consumer', config)).toEqual(result);
  expect(verifyStynxBoundary.mock.calls[0]?.[1]).toBe(config);
  expect(boundaryEngine({ readBoundaryConfig: () => null }).readBoundaryConfig('/consumer')).toBe(null);
});

it('retains full valid coverage summaries and RLS failure locators', () => {
  const coverage = { summary: { openapiPath: null, openapiPaths: 1, implementedOperations: 1, implementedRoutes: 1,
    parameterNameMismatches: [{ openapiPath: '/:id', openapiParam: 'id', routeParam: 'recordId', extra: true }],
    missingInCode: [{ path: '/missing', extra: true }], missingInOpenApi: [],
    operationDrift: [{ method: 'GET', path: '/', reason: 'reason', extra: true }],
    compositionDrift: [{ compositionId: 'composition', reason: 'reason' }], extra: true },
    drift: true, operations: [{ method: 'GET', path: '/', source: 'source.ts', sourceLine: 1, extra: true }], openapiPath: '/openapi.json', extra: true };
  const verifyApiCoverage = vi.fn((_options: unknown) => coverage);
  expect(apiCoverageEngine({ verifyApiCoverage }).verifyApiCoverage(rootOptions)).toEqual(coverage);
  expect(verifyApiCoverage.mock.calls[0]?.[0]).toBe(rootOptions);
  const rls = { files: ['schema.sql'], tables: ['domain.entry'], failures: [{ message: 'missing policy', locator: null, evidence: true }], extra: true };
  const verifyRlsNegative = vi.fn((_options: unknown) => rls);
  expect(rlsEngine({ verifyRlsNegative }).verifyRlsNegative(rlsOptions)).toEqual(rls);
  expect(verifyRlsNegative.mock.calls[0]?.[0]).toBe(rlsOptions);
});

it('checks the OpenAPI line locator lazily without discarding its valid evidence', () => {
  const lineOf = vi.fn((_path: string | undefined) => 7);
  const result = openApiContractEngine({ verifyOpenApiContract: () => ({ paths: 1, operations: 2, failures: ['finding'], extra: true, lineOf }) }).verifyOpenApiContract(rootOptions);
  expect(lineOf).not.toHaveBeenCalled();
  expect(result).toMatchObject({ paths: 1, operations: 2, failures: ['finding'], extra: true });
  expect(result.lineOf('/path')).toBe(7);
  expect(result.lineOf(undefined)).toBe(7);
  expect(lineOf.mock.calls).toEqual([['/path'], [undefined]]);
});

it.each([-1, 1.5, 'private-line', Number.NaN])('rejects malformed OpenAPI locator output %s', (line) => {
  const result = openApiContractEngine({ verifyOpenApiContract: () => ({ paths: 0, operations: 0, failures: [], lineOf: () => line }) }).verifyOpenApiContract(rootOptions);
  expect(() => result.lineOf('/')).toThrow('Check engine returned invalid OpenAPI source line evidence');
});

it('validates every public-API engine stage while preserving unknown package payloads', () => {
  const specs = [{ name: '@consumer/data', dir: '/consumer/packages/data', extension: true }];
  const baselines = { packages: { '@consumer/data': { opaque: ['entry'] } }, extension: true };
  const compareBaselines = vi.fn((_expected: unknown, _current: unknown, _specs: unknown) => ['package: changed']);
  const engine = publicApiEngine({ discoverPackages: () => specs, currentBaselines: () => baselines, compareBaselines });
  expect(engine.discoverPackages('/consumer', ['packages'])).toEqual(specs);
  expect(engine.currentBaselines('/consumer', specs)).toEqual(baselines);
  expect(engine.compareBaselines(baselines, baselines, specs)).toEqual(['package: changed']);
  expect(compareBaselines.mock.calls[0]).toEqual([baselines, baselines, specs]);
  expect(() => publicApiEngine({ currentBaselines: () => ({ packages: [] }) }).currentBaselines('/consumer', specs)).toThrow('invalid API baselines evidence');
  expect(() => publicApiEngine({ compareBaselines: () => [17] }).compareBaselines(baselines, baselines, specs)).toThrow('invalid API baseline comparison evidence');
});
