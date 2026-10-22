import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';

// The six check commands wired through the commander program, run in-process against an empty
// consumer root: a zero-observation run passes with observed 0, undeclared inputs fail, and the
// working directory is never written.
describe('stynx check commands (in-process program)', () => {
  const root = mkdtempSync(join(tmpdir(), 'stynx-cli-checks-'));
  let stdout = '';
  let originalExitCode: string | number | undefined;

  beforeEach(() => {
    stdout = '';
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  async function run(...args: string[]): Promise<number | string | undefined> {
    const program = buildProgram();
    program.exitOverride();
    await program.parseAsync(args, { from: 'user' });
    return process.exitCode;
  }

  function json(): Record<string, unknown> {
    return JSON.parse(stdout) as Record<string, unknown>;
  }

  it('list-routes --json passes a zero-observation run with exit 0', async () => {
    expect(await run('list-routes', '--json')).toBe(0);
    expect(json()).toMatchObject({
      schemaVersion: '1',
      command: 'list-routes',
      status: 'PASS',
      counts: { expected: 0, observed: 0, evaluated: 0 },
      roots: ['domain/*/api/src', 'apps/*/src'],
      findings: [],
    });
    stdout = '';
    expect(await run('list-routes', '--json', '--roots', 'src')).toBe(0);
    expect(json()).toMatchObject({ roots: ['src'], resolvedRoots: [] });
  });

  it('verify-stynx-boundary prints the text form and exits 1 without .stynxrc.json', async () => {
    expect(await run('verify-stynx-boundary')).toBe(1);
    expect(stdout).toBe(
      'verify-stynx-boundary: FAIL observed 0/0\n.stynxrc.json:1 .stynxrc.json is missing; the boundary is undeclared [S-34] add .stynxrc.json with a boundary block (roots, allowedPackages)\n',
    );
  });

  it('verify-api-coverage reports drift and fails only with --strict', async () => {
    expect(await run('verify-api-coverage', '--json')).toBe(0);
    const reported = json();
    expect(reported).toMatchObject({
      command: 'verify-api-coverage',
      status: 'PASS',
      strict: false,
    });
    expect((reported.findings as unknown[]).length).toBeGreaterThan(0);
    stdout = '';
    expect(await run('verify-api-coverage', '--strict', '--json')).toBe(1);
    expect(json()).toMatchObject({ status: 'FAIL', strict: true });
  });

  it('verify-openapi-contract fails when the OpenAPI document is missing', async () => {
    expect(await run('verify-openapi-contract', '--json')).toBe(1);
    expect(json()).toMatchObject({
      status: 'FAIL',
      findings: [
        {
          locator: 'docs/framework/contracts/openapi.json:1',
          message: 'OpenAPI document is missing',
        },
      ],
    });
  });

  it('verify-public-api-baselines passes with no packages and no baseline', async () => {
    expect(await run('verify-public-api-baselines', '--json')).toBe(0);
    expect(json()).toMatchObject({ status: 'PASS', packages: [], counts: { observed: 0 } });
  });

  it('verify-rls-negative passes a zero-table run with the default and an explicit --ddl', async () => {
    expect(await run('verify-rls-negative', '--json')).toBe(0);
    expect(json()).toMatchObject({
      status: 'PASS',
      ddl: ['database/ddl'],
      counts: { observed: 0 },
    });
    stdout = '';
    expect(await run('verify-rls-negative', '--ddl', 'db/a, db/b')).toBe(0);
    expect(stdout).toBe('verify-rls-negative: PASS observed 0/0\n');
  });

  it('never writes into the consumer root', () => {
    expect(readdirSync(root)).toEqual([]);
  });
});
