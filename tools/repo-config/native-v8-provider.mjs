import v8 from '@vitest/coverage-v8';
import { V8CoverageProvider } from '@vitest/coverage-v8/dist/provider.js';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNativeCoverage } from './native-coverage.mjs';
import { createVitestConfig } from './vitest.base.mjs';

const refuse = (message) => {
  throw new Error(`Native V8 coverage: ${message}`);
};
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const escapePattern = (path) =>
  [...path.split(sep).join('/')]
    .map((character) => ('*?[]{}()!+@\\'.includes(character) ? `\\${character}` : character))
    .join('');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function dataRecord(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype)
    refuse('expected a plain policy record');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !equal(Reflect.ownKeys(value).sort(), [...keys].sort()) ||
    Object.values(descriptors).some((entry) => !('value' in entry) || !entry.enumerable)
  )
    refuse('unsupported policy keys or accessors');
  return value;
}

function dataArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    refuse('expected an ordinary array');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => descriptors[index]).some(
      (entry) => !entry || !('value' in entry) || !entry.enumerable,
    )
  )
    refuse('array accessors, holes or extra properties are unsupported');
  return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}

function strings(value, distinct = true) {
  value = dataArray(value);
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== 'string') ||
    (distinct && new Set(value).size !== value.length)
  )
    refuse('expected distinct nonempty string declarations');
  return [...value];
}

function nativeSettings(config) {
  const descriptor = Object.getOwnPropertyDescriptor(config.coverage, 'nativeCoverage');
  if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
    refuse('native settings must be an own data property');
  const policy = dataRecord(descriptor.value, ['modules', 'includes', 'excludes', 'mode']);
  strings(policy.includes);
  strings(policy.excludes, false);
  for (const entry of dataArray(policy.modules)) dataRecord(entry, ['source', 'output']);
  return policy;
}

/** Same installed V8 engine; only admitted native conversion inputs bypass SSR. */
export class NativeV8CoverageProvider extends V8CoverageProvider {
  #admission;
  #failure;
  #root;
  #inputs;
  #aggregateFlag;
  #resolved;
  #context;
  #project;
  #vite;
  #config;
  #projectConfig;
  #publicSettings;

  #guard(operation) {
    if (this.#failure) throw this.#failure;
    try {
      return operation();
    } catch (error) {
      this.#failure ??= error;
      throw this.#failure;
    }
  }

  #verify() {
    this.#guard(() => {
      if (!this.#admission) refuse('provider was not initialized');
      if (
        this.#context.config !== this.#config ||
        this.#context.vite !== this.#vite ||
        this.#context.projects.length !== 1 ||
        this.#context.projects[0] !== this.#project ||
        this.#project.config !== this.#projectConfig ||
        this.#project.vite !== this.#vite ||
        !equal(this.#publicSettings, this.#publicIdentity())
      )
        refuse('public privacy configuration changed after admission');
      if (process.env.STYNX_AGGREGATE_COVERAGE !== this.#aggregateFlag)
        refuse('coverage mode changed after admission');
      this.#admission.verify();
      if (!equal(this.#resolved, this.#optionsIdentity()))
        refuse('resolved coverage options changed after admission');
      for (const { path, physical, sha256 } of this.#inputs) {
        if (realpathSync(path) !== physical || hash(readFileSync(path)) !== sha256)
          refuse(`provider input changed: ${path}`);
      }
    });
  }

  #publicIdentity() {
    const config = this.#context.config;
    const describe = (alias) => {
      dataRecord(alias, ['find', 'replacement']);
      if (typeof alias.find !== 'string' && !(alias.find instanceof RegExp))
        refuse('alias matchers must retain their admitted runtime kind');
      return {
        find:
          typeof alias.find === 'string'
            ? alias.find
            : { source: alias.find.source, flags: alias.find.flags },
        replacement: alias.replacement,
      };
    };
    const settings = (value) => ({
      root: value.root,
      config: value.config,
      environment: value.environment,
      globals: value.globals,
      include: dataArray(value.include),
      setupFiles: dataArray(value.setupFiles),
      execArgv: dataArray(value.execArgv),
      testTimeout: value.testTimeout,
      hookTimeout: value.hookTimeout,
      retry: value.retry,
      pool: value.pool,
      browserEnabled: value.browser.enabled,
    });
    return structuredClone({
      settings: settings(config),
      project: settings(this.#project.config),
      configFile: this.#vite.config.configFile,
      viteRoot: this.#vite.config.root,
      aliases: dataArray(this.#vite.config.resolve.alias).map(describe),
      nativeCoverage: nativeSettings(config),
    });
  }

  #optionsIdentity() {
    const options = this.resolveOptions();
    return structuredClone({
      include: options.include,
      exclude: options.exclude,
      excludeAfterRemap: options.excludeAfterRemap,
      thresholds: options.thresholds,
      allowExternal: options.allowExternal,
      ignoreClassMethods: options.ignoreClassMethods,
    });
  }

  initialize(ctx) {
    this.#guard(() => {
      if (this.#admission) refuse('provider was already initialized');
      const config = ctx.config;
      if (
        config.coverage.provider !== 'custom' ||
        config.coverage.customProviderModule !== fileURLToPath(import.meta.url)
      )
        refuse('unsupported native provider registration');
      const policy = nativeSettings(config);
      this.#aggregateFlag = process.env.STYNX_AGGREGATE_COVERAGE;
      const mode = this.#aggregateFlag === '1' ? 'aggregate' : 'standalone';
      if (policy.mode !== mode)
        refuse('declared coverage mode differs from the existing invocation');
      const includes = strings(policy.includes);
      const excludes = strings(policy.excludes, false);
      const modules = dataArray(policy.modules).map((entry) => {
        dataRecord(entry, ['source', 'output']);
        if (typeof entry.source !== 'string' || typeof entry.output !== 'string')
          refuse('invalid native module paths');
        return { source: entry.source, output: entry.output };
      });
      const root = realpathSync(config.root);
      if (
        root !== resolve(config.root) ||
        JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name !==
          '@stynx-nyx/privacy' ||
        config.config !== resolve(root, 'vitest.coverage.config.ts') ||
        ctx.vite.config.configFile !== config.config ||
        config.environment !== 'node' ||
        config.globals !== true ||
        config.testTimeout !== 30_000 ||
        config.hookTimeout !== 60_000 ||
        config.retry !== 0 ||
        config.browser.enabled !== false ||
        config.pool !== 'forks' ||
        !equal(config.setupFiles, []) ||
        !equal(config.execArgv, []) ||
        !equal(config.include, ['test/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'])
      )
        refuse('unsupported privacy configuration identity or test population');
      this.#root = root;
      const require = createRequire(import.meta.url);
      const viteManifest = createRequire(require.resolve('vitest/package.json')).resolve(
        'vite/package.json',
      );
      const viteRoot = dirname(viteManifest);
      const aliases = dataArray(ctx.vite.config.resolve.alias);
      const expectedAliases = ['core', 'data', 'testing', 'privacy', 'idempotency'].map((name) => ({
        find: `@stynx-nyx/${name}`,
        replacement: resolve(root, '..', name, 'src/index.ts'),
      }));
      if (aliases.length !== expectedAliases.length + 2) refuse('unsupported privacy aliases');
      for (const [index, alias] of aliases.entries()) {
        dataRecord(alias, ['find', 'replacement']);
        if (index < expectedAliases.length) {
          if (!equal(alias, expectedAliases[index])) refuse('privacy alias changed');
        } else {
          const name = index === expectedAliases.length ? 'env' : 'client';
          if (
            !(alias.find instanceof RegExp) ||
            alias.find.source !== `^\\/?@vite\\/${name}` ||
            alias.find.flags !== '' ||
            alias.replacement !== `/@fs${viteRoot}/dist/client/${name}.mjs`
          )
            refuse('installed Vite alias changed');
        }
      }
      const projects = dataArray(ctx.projects);
      if (
        projects.length !== 1 ||
        projects[0].config.root !== root ||
        projects[0].config.config !== config.config ||
        projects[0].config.environment !== 'node' ||
        projects[0].vite !== ctx.vite
      )
        refuse('unsupported privacy projects');
      this.#context = ctx;
      this.#project = projects[0];
      this.#vite = ctx.vite;
      this.#config = config;
      this.#projectConfig = projects[0].config;
      const original = createVitestConfig({
        packageDir: root,
        packageName: '@stynx-nyx/privacy',
        include: ['test/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
        collectCoverageFrom: [
          'src/**/*.ts',
          '!src/index.ts',
          '!src/tokens.ts',
          '!src/privacy.module.ts',
        ],
      });
      if (
        !equal(includes, ['src/**/*.ts']) ||
        !equal(original.test.coverage.exclude, [
          `${escapePattern(root)}-*/**`,
          ...excludes.map((pattern) => `${escapePattern(root)}/${pattern}`),
        ])
      )
        refuse('declarations differ from the original source policy');
      this.#admission = createNativeCoverage({ packageDir: root, modules, includes, excludes });
      super.initialize(ctx);
      const options = this.resolveOptions();
      // These are the unchanged hard-coded exclusions appended by installed
      // Vitest 4.1.12. They cover tests/config/virtual/dependency files only.
      const resolvedExcludes = [
        ...original.test.coverage.exclude,
        ...config.include,
        config.config,
        ...['vitest.config', 'vite.config'].flatMap((name) =>
          ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'].map((extension) => `${name}${extension}`),
        ),
        '**/virtual:*',
        '**/__x00__*',
        '**/node_modules/**',
      ];
      if (
        !equal(options.include, this.#admission.include.map(escapePattern)) ||
        !equal(options.exclude, resolvedExcludes) ||
        options.excludeAfterRemap !== true ||
        options.allowExternal !== false ||
        !equal(options.ignoreClassMethods, []) ||
        !equal(options.thresholds, original.test.coverage.thresholds) ||
        (mode === 'standalone' &&
          ['statements', 'branches', 'functions', 'lines'].some(
            (key) => options.thresholds[key] !== 100,
          ))
      )
        refuse('resolved coverage population or thresholds differ');
      const runtimePath = require.resolve('@vitest/coverage-v8');
      const providerPath = require.resolve('@vitest/coverage-v8/dist/provider.js');
      const packagePath = resolve(dirname(runtimePath), '../package.json');
      const vitestPath = require.resolve('vitest/package.json');
      const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
      if (
        this.version !== version ||
        JSON.parse(readFileSync(vitestPath, 'utf8')).version !== version
      )
        refuse('installed runtime and provider versions differ');
      this.#inputs = [
        viteManifest,
        resolve(viteRoot, 'dist/node/index.js'),
        resolve(viteRoot, 'dist/node/chunks/config.js'),
        runtimePath,
        providerPath,
        packagePath,
        vitestPath,
        fileURLToPath(import.meta.url),
        fileURLToPath(new URL('./native-coverage.mjs', import.meta.url)),
        fileURLToPath(new URL('./vitest.base.mjs', import.meta.url)),
        fileURLToPath(new URL('./test-thresholds.mjs', import.meta.url)),
        fileURLToPath(new URL('./test-policy.json', import.meta.url)),
        config.config,
        resolve(root, 'package.json'),
      ].map((path) => ({ path, physical: realpathSync(path), sha256: hash(readFileSync(path)) }));
      this.#resolved = this.#optionsIdentity();
      const publicSettings = this.#publicIdentity();
      if (!equal(publicSettings.settings, publicSettings.project))
        refuse('privacy project settings differ from the admitted global settings');
      this.#publicSettings = publicSettings;
      this.#verify();
    });
  }

  async transformFile(url, project, environment) {
    let nonownedDelegation = false;
    try {
      return await this.#guard(async () => {
        if (!this.#admission) refuse('provider was not initialized');
        const native = this.#admission.nativeTransform(url);
        const source = this.#admission.isSourceTransform(url);
        if (!native && !source) {
          nonownedDelegation = true;
          return super.transformFile(url, project, environment);
        }
        if (
          environment !== 'ssr' ||
          project !== this.#project ||
          realpathSync(project.config.root) !== this.#root
        )
          refuse('unsupported native project or transform environment');
        this.#verify();
        if (native) return native;
        const actual = await super.transformFile(url, project, environment);
        this.#verify();
        const repaired = this.#admission.repairSourceTransform(url, actual);
        this.#verify();
        return repaired;
      });
    } catch (error) {
      if (nonownedDelegation) throw error;
      this.#failure ??= error;
      throw this.#failure;
    }
  }

  async generateCoverage(...args) {
    this.#verify();
    try {
      const coverage = await super.generateCoverage(...args);
      this.#verify();
      this.#guard(() => {
        const expected = this.#admission.evidence.bindings.map((entry) => entry.source).sort();
        if (!equal(coverage.files().sort(), expected))
          refuse('final coverage differs from the original source census');
      });
      return coverage;
    } catch (error) {
      this.#failure ??= error;
      throw this.#failure;
    }
  }
}

export default {
  ...v8,
  async getProvider() {
    return new NativeV8CoverageProvider();
  },
};
