import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// SM-18 acceptance: `stynx-sdk-codegen --check` is exit 0 on the committed SDK, exit 1 with a
// `<path>:1` locator once one generated file is edited, and writes nothing either way. The
// write form regenerates the committed bytes, and openapi-typescript-codegen is gone.
const packageRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(packageRoot, '../..');
const bin = join(packageRoot, 'codegen/stynx-sdk-codegen.mjs');
const input = join(workspaceRoot, 'docs/framework/contracts/openapi.json');
const committed = join(packageRoot, 'src/generated');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  bin: Record<string, string>;
  files: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function codegen(args: string[], cwd = packageRoot) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
  });
  expect(String(result.error ?? 'none')).toBe('none');
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

const gitStatus = () =>
  execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: packageRoot, encoding: 'utf8' });

describe('stynx-sdk-codegen', () => {
  // A consumer-shaped copy: the SDK output plus the Prettier settings that govern it.
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-sdk-codegen-'));
  const prettier = (
    JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf8')) as { prettier: unknown }
  ).prettier;
  writeFileSync(
    join(workspace, 'package.json'),
    `${JSON.stringify({ name: 'sdk-consumer', private: true, prettier }, null, 2)}\n`,
  );
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it('is the published bin and openapi-typescript-codegen is no dependency', () => {
    expect(manifest.bin).toEqual({ 'stynx-sdk-codegen': './codegen/stynx-sdk-codegen.mjs' });
    expect(manifest.files).toEqual(['dist', 'codegen']);
    expect(
      [manifest.dependencies ?? {}, manifest.devDependencies ?? {}].map((deps) =>
        Object.hasOwn(deps, 'openapi-typescript-codegen'),
      ),
    ).toEqual([false, false]);
  });

  it('--check passes on the committed SDK and writes nothing', () => {
    const before = gitStatus();
    const result = codegen(['--check', '--input', input, '--output', 'src/generated']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^stynx-sdk-codegen: 652 generated files match\n$/u);
    expect(gitStatus()).toBe(before);
  });

  it('--check exits 1 naming the one edited file, and leaves the edit in place', () => {
    const output = join(workspace, 'edited');
    cpSync(committed, output, { recursive: true });
    const edited = join(output, 'services/RecordNotesService.ts');
    writeFileSync(edited, `${readFileSync(edited, 'utf8')}// hand edit\n`);
    const before = snapshot(output);
    const result = codegen(['--check', '--input', input, '--output', output]);
    expect(result.status).toBe(1);
    expect(result.stdout.split('\n')[0]).toBe(
      `${output}/services/RecordNotesService.ts:1 differs from regeneration`,
    );
    expect(result.stdout).toMatch(/1 of 652 generated files drifted\n$/u);
    expect(snapshot(output)).toEqual(before);
  });

  it('--check reports missing and unlisted files', () => {
    const output = join(workspace, 'set');
    cpSync(committed, output, { recursive: true });
    rmSync(join(output, 'models/TenantState.ts'));
    writeFileSync(join(output, 'models/Stray.ts'), 'export type Stray = string;\n');
    const result = codegen(['--check', '--input', input, '--output', output]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${output}/models/TenantState.ts:1 generated file is missing`);
    expect(result.stdout).toContain(`${output}/models/Stray.ts:1 is not a generated file`);
  });

  it('the write form reproduces the committed bytes', () => {
    const output = join(workspace, 'written');
    const result = codegen(['--input', input, '--output', output]);
    expect(result.status, result.stderr).toBe(0);
    expect(snapshot(output)).toEqual(snapshot(committed));
  });

  it('refuses unusable invocations with exit 2', () => {
    expect(codegen(['--check', '--output', 'src/generated']).status).toBe(2);
    expect(
      codegen(['--check', '--input', join(workspace, 'absent.json'), '--output', 'x']).status,
    ).toBe(2);
    expect(codegen(['--bogus']).status).toBe(2);
  });
});
