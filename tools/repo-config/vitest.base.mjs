import { defineConfig } from 'vitest/config';
import swcMod from 'unplugin-swc';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCoverageThreshold } from './test-thresholds.mjs';

// unplugin-swc exports its plugin factories as `{ vite, esbuild, ... }` on the
// default export. Vite's config loader sometimes double-wraps the default, so
// unwrap defensively.
const swc = swcMod && typeof swcMod.vite === 'function' ? swcMod : (swcMod?.default ?? swcMod);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

// Resolve bare imports the way Node does — walk up to the workspace root and
// check `.pnpm/node_modules/<pkg>` if the package isn't symlinked under the
// importing package. Vitest's stricter ESM resolver otherwise fails on
// transitive devDeps (e.g. `@nestjs/testing` in packages that don't list it).
// Runs in `post` enforcement so the default resolver gets first crack.
const workspaceFallbackResolve = {
  name: 'stynx:workspace-fallback-resolve',
  enforce: 'post',
  async resolveId(source, importer) {
    if (!source || source.startsWith('.') || source.startsWith('/')) return null;
    if (source.startsWith('node:') || source.startsWith('virtual:') || source.startsWith('\0'))
      return null;
    const resolved = await this.resolve(source, importer, { skipSelf: true });
    if (resolved) return null;
    const hoistedRoot = resolve(repoRoot, 'node_modules/.pnpm/node_modules');
    if (!existsSync(hoistedRoot)) return null;
    try {
      const req = createRequire(`${hoistedRoot}/_.js`);
      return req.resolve(source);
    } catch {
      return null;
    }
  },
};

// drizzle-orm `is()` walks prototype chains and explodes on null-prototype
// values (Module namespace objects from `export * as foo from './bar'`).
// Patch `is()` at transform time to short-circuit null-proto values before
// they reach the prototype walk.
const drizzleIsPatch = {
  name: 'stynx:drizzle-is-patch',
  enforce: 'post',
  transform(code, id) {
    if (!/drizzle-orm\/entity(\.[cm]?js)?$/.test(id)) return null;
    if (!/function is\(value, type\)/.test(code)) return null;
    const patched = code.replace(
      /function is\(value, type\) \{\s*if \(!value \|\| typeof value !== "object"\) \{\s*return false;\s*\}/,
      'function is(value, type) {\n  if (!value || typeof value !== "object") { return false; }\n  if (Object.getPrototypeOf(value) === null) { return false; }',
    );
    return patched === code ? null : { code: patched, map: null };
  },
};

// Coverage thresholds resolve from tools/repo-config/test-thresholds.mjs
// (which reads scripts/test-matrix.config.json). Keep these named exports
// as transitional aliases for configs that import them directly; prefer
// `getCoverageThreshold(packageName)` going forward.
const baseCoverageThreshold = { statements: 85, branches: 80, functions: 85, lines: 85 };
const strictCoverageThreshold = { statements: 95, branches: 95, functions: 95, lines: 95 };
const completeCoverageThreshold = { statements: 100, branches: 100, functions: 100, lines: 100 };
const disabledCoverageThreshold = { statements: 0, branches: 0, functions: 0, lines: 0 };
const coverageMetricKeys = ['statements', 'branches', 'functions', 'lines'];

function coverageThresholdValues(threshold) {
  return Object.fromEntries(coverageMetricKeys.map((key) => [key, threshold[key]]));
}

function isCompleteCoverageThreshold(threshold) {
  return coverageMetricKeys.every((key) => threshold[key] === completeCoverageThreshold[key]);
}

export function createVitestConfig({
  packageDir,
  packageName,
  include = ['test/**/*.spec.ts', 'test/**/*.test.ts'],
  collectCoverageFrom = ['src/**/*.ts'],
  coverageExclude = [],
  coverageDir = 'coverage-vitest',
  coverageThreshold,
  alias = {},
  environment = 'node',
  globals = true,
  setupFiles = [],
  testTimeout = 30000,
  hookTimeout = 60_000,
  singleThread = false,
  passWithNoTests = false,
  patchDrizzle = false,
}) {
  const threshold =
    process.env.STYNX_AGGREGATE_COVERAGE === '1'
      ? disabledCoverageThreshold
      : (coverageThreshold ?? getCoverageThreshold(packageName));
  const thresholdValues = coverageThresholdValues(threshold);

  const drizzleAlias = patchDrizzle
    ? { 'drizzle-orm/entity': resolve(repoRoot, 'tools/repo-config/drizzle-entity-shim.mjs') }
    : {};

  return defineConfig({
    root: packageDir,
    resolve: {
      alias: { ...drizzleAlias, ...alias },
    },
    plugins: [
      workspaceFallbackResolve,
      drizzleIsPatch,
      swc.vite({
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
          keepClassNames: true,
        },
        module: { type: 'es6' },
      }),
    ],
    test: {
      globals,
      environment,
      include,
      setupFiles,
      testTimeout,
      hookTimeout,
      passWithNoTests,
      // Inline @nestjs/@aws-sdk/@stynx-* so vi.mock can intercept their
      // exports and so require() / import() resolve to the same module
      // instance (avoids CJS/ESM dual-class-identity issues with NestJS DI).
      server: { deps: { inline: [/@nestjs/, /@aws-sdk/, /@stynx\//, /@stynx-web\//] } },
      ...(singleThread
        ? {
            fileParallelism: false,
            maxWorkers: 1,
            minWorkers: 1,
            pool: 'threads',
            poolOptions: { threads: { singleThread: true } },
          }
        : {}),
      reporters: ['default'],
      coverage: {
        provider: 'v8',
        reportsDirectory: resolve(packageDir, coverageDir),
        reporter: ['text', 'json', 'lcov'],
        include: collectCoverageFrom,
        exclude: [
          'src/generated/**',
          'src/**/index.ts',
          'src/index.ts',
          'src/main.ts',
          'src/**/*.module.ts',
          'src/**/constants.ts',
          'src/**/tokens.ts',
          'src/**/types.ts',
          'src/**/*.d.ts',
          ...coverageExclude,
        ],
        thresholds: {
          ...thresholdValues,
          ...(isCompleteCoverageThreshold(thresholdValues) ? { autoUpdate: false } : {}),
        },
      },
    },
  });
}

export { baseCoverageThreshold, strictCoverageThreshold, completeCoverageThreshold };
