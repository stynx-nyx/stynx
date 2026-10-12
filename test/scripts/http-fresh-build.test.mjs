import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  closeFreshHttpBuild,
  prepareFreshHttpBuild,
  snapshotFreshHttpBuild,
  workerModuleReceiptFromFreshBuild,
} from '../../scripts/lib/http-fresh-build.mjs';

// Real public owner only. Public-registry network and the pinned supported host are
// requirements, not mocked services. A refusal on another host is not positive acceptance.
const filename = fileURLToPath(import.meta.url);
const repository = resolve(dirname(filename), '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const npmrc =
  '@stynx-nyx:registry=https://npm.pkg.github.com\n' +
  '@aarusso-nyx:registry=https://npm.pkg.github.com\n' +
  '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n';
const refusal = (code, message) => (error) => {
  assert.equal(error.code, code);
  assert.match(error.message, message);
  return true;
};

if (!process.env.STYNX_FRESH_OWNER_TEST_CHILD) {
  test('fresh owner public API in a credential-free private process', async (t) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx fresh protocol espaço 日本語 ')));
    t.diagnostic(`Private acceptance and raw logs: ${root}`);
    const env = {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: join(root, 'home'),
      TMPDIR: join(root, 'tmp'),
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      CI: 'true',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_NO_LAZY_FETCH: '1',
      npm_config_userconfig: '/dev/null',
      npm_config_globalconfig: '/dev/null',
      npm_config_store_dir: join(root, 'store'),
      npm_config_ignore_pnpmfile: 'true',
      npm_config_manage_package_manager_versions: 'false',
      STYNX_FRESH_OWNER_TEST_CHILD: root,
    };
    for (const path of ['home', 'tmp', 'store']) mkdirSync(join(root, path));
    // Intentionally no inherited credentials, preloads, Git configuration or package hooks.
    assert.equal(Object.hasOwn(env, 'NODE_AUTH_TOKEN'), false);
    const child = spawn(process.execPath, ['--test', filename], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const status = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
    writeFileSync(join(root, 'suite.stdout'), stdout);
    writeFileSync(join(root, 'suite.stderr'), stderr);
    t.diagnostic(stdout);
    assert.deepEqual(status, { code: 0, signal: null }, `See ${root}/suite.{stdout,stderr}`);
  });
} else {
  test('real three-member fresh build, custody, and pre-execution refusals', async (t) => {
    const root = process.env.STYNX_FRESH_OWNER_TEST_CHILD;
    const save = (name, value) =>
      writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
    const sourceHashes = Object.fromEntries(
      ['http-fresh-build.mjs', 'http-build-observer.cjs'].map((name) => [
        name,
        hash(readFileSync(join(repository, 'scripts/lib', name))),
      ]),
    );
    const request = {
      sourceRepository: repository,
      candidateCommit: '0'.repeat(40),
      rootId: 'reference',
    };
    await t.test('closed request and accessor admission does not execute getters', async () => {
      await assert.rejects(
        prepareFreshHttpBuild({ ...request, command: 'true' }),
        refusal('HTTP_FRESH_BUILD_INVALID', /request|field|key/i),
      );
      let calls = 0;
      const accessor = { ...request };
      Object.defineProperty(accessor, 'rootId', {
        enumerable: true,
        get() {
          calls++;
          return 'reference';
        },
      });
      await assert.rejects(
        prepareFreshHttpBuild(accessor),
        refusal('HTTP_FRESH_BUILD_INVALID', /request|data|accessor/i),
      );
      assert.equal(calls, 0);
      await assert.rejects(
        prepareFreshHttpBuild({ ...request, rootId: 'unknown' }),
        refusal('HTTP_FRESH_BUILD_INVALID', /root|request/i),
      );
    });
    if (
      process.platform !== 'darwin' ||
      process.arch !== 'arm64' ||
      process.versions.node !== '24.20.0'
    ) {
      await t.test(
        'unsupported toolchain explicitly refuses, with no positive build claim',
        async () => {
          await assert.rejects(
            prepareFreshHttpBuild(request),
            refusal('HTTP_FRESH_BUILD_INVALID', /platform|toolchain|Node|darwin|arm64/i),
          );
        },
      );
      t.diagnostic(
        'Unsupported host: refusal only; supported-toolchain positive acceptance was not executed.',
      );
      save('acceptance.json', {
        sourceHashes,
        supportedHost: false,
        positiveBuildExecuted: false,
        readinessPromoting: false,
        runtimeCustodyComplete: false,
      });
      return;
    }
    assert.equal(process.env.NODE_AUTH_TOKEN, undefined);
    const repo = join(root, 'repository');
    const command = (file, args, cwd = root) =>
      execFileSync(file, args, {
        cwd,
        env: process.env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    const git = (...args) =>
      command('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-C', repo, ...args]);
    const write = (path, bytes) => {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      writeFileSync(join(repo, path), bytes);
    };
    const json = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
    const commit = (label) => {
      git('add', '--all', '--force');
      git(
        '-c',
        'user.name=Inspector Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        `fixture ${label}`,
      );
      const sha = git('rev-parse', 'HEAD');
      git('update-ref', `refs/heads/codex/fixture-${label}`, sha);
      return sha;
    };
    // Clone real immutable baseline objects; historical source identity is not fabricated.
    command('/usr/bin/git', [
      '-c',
      'core.hooksPath=/dev/null',
      'clone',
      '--no-local',
      '--no-hardlinks',
      '--no-checkout',
      '--no-tags',
      '--',
      repository,
      repo,
    ]);
    git('read-tree', '--empty');
    write('.gitignore', 'node_modules/\ndist/\n');
    json('package.json', {
      name: 'private-fresh-owner-fixture',
      version: '1.0.0',
      private: true,
      packageManager: 'pnpm@9.15.0',
      devDependencies: { typescript: '6.0.3' },
    });
    write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n  - reference/*\n');
    for (const [name, folder, build, rootDir] of [
      ['core', 'packages/core', 'tsc -p tsconfig.json && pnpm run @stynx:emit-openapi', '..'],
      ['preferences', 'packages/preferences', 'tsc -p tsconfig.json', '..'],
      [
        'reference-api',
        'reference/api',
        'node ../../scripts/verify-reference-api-build-inputs.mjs && tsc -p tsconfig.json',
        '../..',
      ],
    ]) {
      const manifest = {
        name: `@stynx-nyx/${name}`,
        private: true,
        version: '1.0.0',
        scripts: { build },
      };
      if (name === 'core')
        manifest.scripts['@stynx:emit-openapi'] = 'node ./scripts/emit-openapi.mjs';
      if (name === 'reference-api') {
        manifest.scripts.start = 'node dist/reference/api/src/main.js';
        manifest.dependencies = { '@stynx-nyx/preferences': 'workspace:*' };
      } else {
        const stem = `${name}/src/index`;
        Object.assign(manifest, {
          main: `dist/${stem}.js`,
          types: `dist/${stem}.d.ts`,
          exports: {
            '.': {
              types: `./dist/${stem}.d.ts`,
              require: `./dist/${stem}.js`,
              default: `./dist/${stem}.js`,
            },
          },
        });
        if (name === 'preferences') manifest.dependencies = { '@stynx-nyx/core': 'workspace:*' };
      }
      json(`${folder}/package.json`, manifest);
      json(`${folder}/tsconfig.json`, {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          rootDir,
          outDir: 'dist',
          sourceMap: true,
          declaration: true,
          declarationMap: true,
          types: [],
          strict: true,
        },
        include: ['src/**/*.ts'],
      });
    }
    write('packages/core/src/index.ts', 'export const fixtureCore: string = "actual-core";\n');
    write(
      'packages/preferences/src/index.ts',
      'import { fixtureCore } from "@stynx-nyx/core";\nexport const fixturePreference: string = `${fixtureCore}:preference`;\n',
    );
    write(
      'reference/api/src/main.ts',
      'import { fixturePreference } from "@stynx-nyx/preferences";\nexport const fixtureReference = `${fixturePreference}:reference`;\n',
    );
    for (const path of [
      'packages/core/scripts/emit-openapi.mjs',
      'scripts/verify-reference-api-build-inputs.mjs',
      'law/policy/http-api-compositions.json',
      'docs/framework/api/openapi.json',
    ]) {
      mkdirSync(dirname(join(repo, path)), { recursive: true });
      cpSync(join(repository, path), join(repo, path));
    }
    // Minimal lock generated by actual pnpm9.15.0; the owner performs the real
    // frozen install with its integrity-verified published pnpm, not an ambient shim.
    write(
      'pnpm-lock.yaml',
      `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      typescript:
        specifier: 6.0.3
        version: 6.0.3

  packages/core: {}

  packages/preferences:
    dependencies:
      '@stynx-nyx/core':
        specifier: workspace:*
        version: link:../core

  reference/api:
    dependencies:
      '@stynx-nyx/preferences':
        specifier: workspace:*
        version: link:../../packages/preferences

packages:

  typescript@6.0.3:
    resolution: {integrity: sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==}
    engines: {node: '>=14.17'}
    hasBin: true

snapshots:

  typescript@6.0.3: {}
`,
    );
    write('.npmrc', npmrc);
    const canonical = commit('canonical');
    const policy = JSON.parse(
      readFileSync(join(repo, 'law/policy/http-api-compositions.json'), 'utf8'),
    );
    const history = new Map([
      [policy.compatibilityBaseline.path, policy.compatibilityBaseline.sha256],
      ...policy.operationIdCompatibility.map((row) => [row.source, row.baselineSourceSha256]),
    ]);
    for (const [path, expected] of history)
      assert.equal(
        hash(
          execFileSync(
            '/usr/bin/git',
            ['-C', repo, 'show', `${policy.compatibilityBaseline.commit}:${path}`],
            { env: process.env, maxBuffer: 16 * 1024 * 1024 },
          ),
        ),
        expected,
      );
    rmSync(join(repo, '.npmrc'));
    const absent = commit('absent-config');
    const baseRequest = (candidateCommit) => ({
      sourceRepository: repo,
      candidateCommit,
      rootId: 'reference',
    });
    const accepted = [];
    for (const [label, candidate, mutation] of [
      ['canonical', canonical, 'log'],
      ['absent-config', absent, 'shim'],
    ]) {
      await t.test(
        `${label}: real build, isolated returned snapshot, opaque handle and sticky ${mutation} refusal`,
        async () => {
          const handle = await prepareFreshHttpBuild(baseRequest(candidate));
          let sandbox;
          try {
            const snapshot = snapshotFreshHttpBuild(handle);
            const original = structuredClone(snapshot);
            const receipt = workerModuleReceiptFromFreshBuild(handle);
            sandbox = dirname(snapshot.checkoutRoot);
            cpSync(join(sandbox, 'logs'), join(root, `${label}-raw-logs`), { recursive: true });
            save(`${label}-snapshot.json`, original);
            save(`${label}-worker-receipt.json`, receipt);
            assert.equal(snapshot.candidateCommit, candidate);
            assert.equal(snapshot.tree, git('rev-parse', `${candidate}^{tree}`));
            assert.deepEqual(
              snapshot.graph.selected.map((row) => row.name),
              ['@stynx-nyx/core', '@stynx-nyx/preferences', '@stynx-nyx/reference-api'],
            );
            assert.equal(snapshot.compilers.length, 3);
            assert.equal(
              snapshot.compilers.reduce((count, row) => count + row.outputs.outputs.length, 0),
              13,
            );
            assert.equal(
              snapshot.compilers
                .flatMap((row) => row.outputs.outputs)
                .filter((row) => row.path.endsWith('/dist/openapi/openapi.json')).length,
              1,
            );
            assert.equal(snapshot.history.length, history.size);
            assert.equal(snapshot.buildObservation.processes.length, 7);
            assert.equal(
              snapshot.commands.every((row) => row.exitCode === 0 && row.signal === null),
              true,
            );
            assert.equal(receipt.nodeVersion, '24.20.0');
            assert.equal(
              receipt.files.some((row) =>
                row.url.endsWith('/reference/api/dist/reference/api/src/main.js'),
              ),
              true,
            );
            for (const value of [snapshot, receipt]) {
              assert.equal(value.readinessPromoting, false);
              assert.equal(value.runtimeCustodyComplete, false);
            }
            // Mutate the ACTUAL returned object and nested rows, not a second clone.
            snapshot.candidateCommit = '0'.repeat(40);
            snapshot.graph.selected[0].name = 'forged';
            snapshot.compilers[0].outputs.outputs[0].sha256 = '0'.repeat(64);
            snapshot.buildObservation.processes.length = 0;
            assert.deepEqual(snapshotFreshHttpBuild(handle), original);
            assert.deepEqual(workerModuleReceiptFromFreshBuild(handle), receipt);
            for (const forged of [
              snapshot,
              structuredClone(original),
              Object.freeze(Object.create(null)),
            ]) {
              assert.throws(
                () => snapshotFreshHttpBuild(forged),
                refusal('HTTP_FRESH_BUILD_INVALID', /handle/i),
              );
            }
            const changed =
              mutation === 'log'
                ? join(sandbox, 'logs/lifecycle/999999-unowned-session.jsonl')
                : join(original.checkoutRoot, 'node_modules/.bin/tsc');
            const previousBytes = mutation === 'shim' ? readFileSync(changed) : null;
            writeFileSync(changed, mutation === 'log' ? '{}\n' : '#!/bin/sh\nexit 0\n');
            assert.throws(
              () => snapshotFreshHttpBuild(handle),
              refusal(
                mutation === 'log' ? 'HTTP_FRESH_BUILD_INVALID' : 'HTTP_BUILD_ROSTER_INVALID',
                mutation === 'log' ? /log population/i : /roster changed/i,
              ),
            );
            assert.throws(
              () => workerModuleReceiptFromFreshBuild(handle),
              refusal('HTTP_FRESH_BUILD_INVALID', /refused.*handle|handle/i),
            );
            if (previousBytes) writeFileSync(changed, previousBytes);
            else rmSync(changed);
            assert.throws(
              () => snapshotFreshHttpBuild(handle),
              refusal('HTTP_FRESH_BUILD_INVALID', /handle/i),
            );
            assert.throws(
              () => workerModuleReceiptFromFreshBuild(handle),
              refusal('HTTP_FRESH_BUILD_INVALID', /handle/i),
            );
            accepted.push({
              stickyAfterRestore: true,
              label,
              candidate,
              tree: original.tree,
              directSnapshotMutationIsolated: true,
              rawLogsRetained: true,
              mutationRefused: mutation,
            });
          } finally {
            await closeFreshHttpBuild(handle);
          }
          assert.equal(existsSync(sandbox), false);
          assert.throws(
            () => snapshotFreshHttpBuild(handle),
            refusal('HTTP_FRESH_BUILD_INVALID', /closed.*handle|handle/i),
          );
          await closeFreshHttpBuild(handle);
        },
      );
    }
    // Each mutation needs its own genuinely successful live owner. A refused
    // handle is deliberately never reused as evidence for a second drift case.
    for (const kind of [
      'config',
      'source',
      'dependency',
      'output-js',
      'output-map',
      'missing',
      'extra',
      'link',
      'mode',
    ]) {
      await t.test(
        `independent ${kind} drift refuses and remains sticky after restoration`,
        async () => {
          const handle = await prepareFreshHttpBuild(baseRequest(canonical));
          try {
            const snapshot = snapshotFreshHttpBuild(handle);
            const sandbox = dirname(snapshot.checkoutRoot);
            cpSync(join(sandbox, 'logs'), join(root, `${kind}-raw-logs`), { recursive: true });
            save(`${kind}-snapshot.json`, snapshot);
            const js = snapshot.compilers
              .flatMap((row) => row.outputs.outputs)
              .find((row) => row.path.endsWith('/preferences/src/index.js')).path;
            const paths = {
              config: 'packages/preferences/tsconfig.json',
              source: 'packages/preferences/src/index.ts',
              dependency: snapshot.dependencies.files.find((row) =>
                row.path.endsWith('/typescript/package.json'),
              ).path,
              'output-js': js,
              'output-map': `${js}.map`,
              missing: js.replace(/\.js$/u, '.d.ts'),
              extra: 'packages/preferences/dist/private-extra.js',
              link: js,
              mode: js,
            };
            const path = join(snapshot.checkoutRoot, paths[kind]);
            const bytes = kind === 'extra' ? null : readFileSync(path);
            const permissions = kind === 'extra' ? null : lstatSync(path).mode & 0o7777;
            if (kind === 'missing') rmSync(path);
            else if (kind === 'link') {
              rmSync(path);
              symlinkSync('index.d.ts', path);
            } else if (kind === 'mode') chmodSync(path, permissions ^ 0o020);
            else
              writeFileSync(
                path,
                kind === 'extra'
                  ? 'export const unexpected = 1;\n'
                  : Buffer.concat([bytes, Buffer.from('\n')]),
              );
            const input = ['config', 'source', 'dependency'].includes(kind);
            assert.throws(
              () => snapshotFreshHttpBuild(handle),
              refusal(
                input ? 'HTTP_BUILD_ROSTER_INVALID' : 'HTTP_FRESH_BUILD_INVALID',
                input
                  ? /bytes differ|roster changed/i
                  : /file roster|file bytes|Linked fresh build/i,
              ),
            );
            if (kind === 'extra') rmSync(path);
            else {
              if (kind === 'link') rmSync(path);
              writeFileSync(path, bytes);
              chmodSync(path, permissions);
              assert.equal(hash(readFileSync(path)), hash(bytes));
              assert.equal(lstatSync(path).mode & 0o7777, permissions);
            }
            assert.throws(
              () => snapshotFreshHttpBuild(handle),
              refusal('HTTP_FRESH_BUILD_INVALID', /handle/i),
            );
            assert.throws(
              () => workerModuleReceiptFromFreshBuild(handle),
              refusal('HTTP_FRESH_BUILD_INVALID', /handle/i),
            );
            accepted.push({
              label: kind,
              candidate: canonical,
              mutationRefused: kind,
              stickyAfterRestore: true,
              rawLogsRetained: true,
            });
          } finally {
            await closeFreshHttpBuild(handle);
          }
        },
      );
    }
    const variants = [
      [
        'sync-helper',
        'packages/core/scripts/emit-openapi.mjs',
        'sync',
        /independent source review/i,
      ],
      [
        'worker-helper',
        'scripts/verify-reference-api-build-inputs.mjs',
        'worker',
        /independent source review/i,
      ],
      ['root-hook', '.hooks/build', 'hook', /lifecycle hook/i],
      ['workspace-hook', 'packages/core/.hooks/build', 'hook', /lifecycle hook/i],
      ['module-hook', 'packages/core/node_modules/.hooks/build', 'hook', /lifecycle hook/i],
      ['install-config', '.npmrc', 'config', /install configuration/i],
      [
        'workspace-launcher',
        'packages/core/package.json',
        'launcher',
        /packageManager|package-manager/i,
      ],
    ];
    for (const [label, path, kind, expected] of variants) {
      await t.test(`${label} refuses before installation or candidate execution`, async () => {
        git('reset', '--hard', canonical);
        const marker = join(root, `${label}.marker`);
        if (kind === 'sync')
          write(
            path,
            `import {spawnSync} from 'node:child_process'; spawnSync('/usr/bin/touch',[${JSON.stringify(marker)}]);\n`,
          );
        if (kind === 'worker')
          write(
            path,
            `import {Worker} from 'node:worker_threads'; new Worker(${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`)},{eval:true});\n`,
          );
        if (kind === 'hook') write(path, `#!/bin/sh\n/usr/bin/touch '${marker}'\n`);
        if (kind === 'config') write(path, `${npmrc}script-shell=/bin/sh\n`);
        if (kind === 'launcher') {
          const value = JSON.parse(readFileSync(join(repo, path), 'utf8'));
          value.packageManager = 'pnpm@9.14.0';
          json(path, value);
        }
        const candidate = commit(label);
        let error;
        await assert.rejects(prepareFreshHttpBuild(baseRequest(candidate)), (value) => {
          error = value;
          return refusal('HTTP_FRESH_BUILD_INVALID', expected)(value);
        });
        assert.equal(existsSync(marker), false);
        const failure = JSON.parse(
          readFileSync(join(error.diagnosticDirectory, 'failure.json'), 'utf8'),
        );
        assert.equal(
          failure.commands.some((row) => row.label === 'install' || row.label === 'build'),
          false,
        );
        assert.equal(
          failure.commands.some((row) => row.label === 'detach'),
          true,
        );
        save(`${label}-refusal.json`, {
          code: error.code,
          message: error.message,
          diagnosticDirectory: error.diagnosticDirectory,
          markerAbsent: true,
        });
      });
    }
    assert.equal(accepted.length, 11);
    for (const [name, expected] of Object.entries(sourceHashes)) {
      assert.equal(hash(readFileSync(join(repository, 'scripts/lib', name))), expected);
    }
    save('acceptance.json', {
      sourceHashes,
      supportedHost: true,
      accepted,
      history: [...history],
      readinessPromoting: false,
      runtimeCustodyComplete: false,
    });
    // Retain only owned diagnostic evidence; successful owner sandboxes are already closed.
    rmSync(repo, { recursive: true, force: true });
  });
}
