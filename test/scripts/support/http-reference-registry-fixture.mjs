import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, lstatSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import {
  deriveReferenceRegistryPlan,
  observeReferenceRegistryObjects,
} from '../../../scripts/lib/http-reference-registry.mjs';

// Test input, compiled by the installed compiler and admitted through the real
// producer. It establishes component behavior, never the reference application's
// constructor/source, factory, provider, transport or release acceptance.
export function createRegistryFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx registry espaço 日本語 ')));
  const require = createRequire(join(root, 'fixture.cjs'));
  const files = [];
  const compilers = [];
  const loaded = [];
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const write = (path, bytes) => {
    const absolute = resolve(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, bytes);
    return {
      path,
      sha256: hash(bytes),
      byteLength: Buffer.byteLength(bytes),
      permissions: lstatSync(absolute).mode & 0o7777,
    };
  };
  const preferencesOutput = 'packages/preferences/dist/preferences/src/preferences.controller.js';
  const guardedOutput = 'reference/api/dist/reference/api/src/app.module.js';
  const relativeImport = relative(dirname(guardedOutput), preferencesOutput).replace(/\.js$/u, '');
  const specifications = [
    {
      packageRoot: 'packages/preferences',
      source: 'packages/preferences/src/preferences.controller.ts',
      output: preferencesOutput,
      text: `export class PreferencesController {\n${Array.from({ length: 7 }, (_, i) => `m${i}() { return ${i}; }`).join('\n')}\n}\n`,
    },
    {
      packageRoot: 'reference/api',
      source: 'reference/api/src/app.module.ts',
      output: guardedOutput,
      text: `import { PreferencesController } from '${relativeImport}';\nexport class GuardedPreferencesController extends PreferencesController {}\n`,
    },
  ];
  try {
    for (const specification of specifications) {
      const source = write(specification.source, specification.text);
      files.push(source);
      const emitted = ts.transpileModule(specification.text, {
        fileName: specification.source,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          sourceMap: true,
        },
      });
      const mapping = JSON.parse(emitted.sourceMapText);
      mapping.file = specification.output.split('/').at(-1);
      mapping.sources = [relative(dirname(specification.output), specification.source)];
      mapping.sourceRoot = '';
      const output = write(specification.output, emitted.outputText);
      const map = write(`${specification.output}.map`, JSON.stringify(mapping));
      compilers.push({
        plan: {
          packageRoot: specification.packageRoot,
          compiler: { version: ts.version },
          expectedOutputs: [{ path: output.path, source: source.path }],
        },
        byteRows: [output, map],
        outputs: {
          mapLinks: [{ emittedPath: output.path, sha256: map.sha256, sources: [source] }],
        },
      });
    }
    const candidateCommit = 'a'.repeat(40);
    const tree = 'b'.repeat(40);
    const inputs = { schemaVersion: 1, candidateCommit, tree, files };
    const referenceRegistry = deriveReferenceRegistryPlan({
      checkoutRoot: root,
      inputs,
      compilers,
    });
    const PreferencesController = require(resolve(root, preferencesOutput)).PreferencesController;
    const GuardedPreferencesController = require(
      resolve(root, guardedOutput),
    ).GuardedPreferencesController;
    loaded.push(resolve(root, preferencesOutput), resolve(root, guardedOutput));
    const instance = new GuardedPreferencesController();
    const wrapper = {
      metatype: GuardedPreferencesController,
      instance,
      token: GuardedPreferencesController,
    };
    const module = {
      metatype: class FixtureModule {},
      controllers: new Map([[GuardedPreferencesController, wrapper]]),
      providers: new Map([
        ['factory', { metatype: () => ({}), instance: {}, inject: [] }],
        ['value', { metatype: null, instance: {} }],
        ['alias', { metatype: null, instance: {}, isAlias: true }],
      ]),
      imports: new Set(),
      exports: new Set(),
    };
    const modules = new Map([['fixture', module]]);
    const job = {
      checkoutRoot: root,
      mode: 'reference-owned-loopback',
      compositionId: 'reference',
      candidateCommit,
      tree,
      referenceRegistry,
    };
    const handle = observeReferenceRegistryObjects(job, modules);
    return {
      root,
      job,
      modules,
      module,
      wrapper,
      instance,
      PreferencesController,
      GuardedPreferencesController,
      handle,
      close() {
        for (const path of loaded) delete require.cache[path];
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    for (const specification of specifications)
      delete require.cache[resolve(root, specification.output)];
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
