import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkCommandNames, exitCodeFor, formatCheckText, runCheck } from '../src/checks.js';

// SM-07 acceptance: the six read-only entry points run from a consumer root outside the STYNX
// checkout, emit one JSON object, never write, and turn one seeded violation each into a
// non-zero exit with a `<path>:<line>` locator.
const packageRoot = resolve(__dirname, '..');
const cli = join(packageRoot, 'dist/cli/src/main.js');
const engines = join(packageRoot, 'engines');

// Assembled so the repository's own boundary scan of this file does not read it as an import.
const undeclaredSeam = ['@stynx', 'internal/data'].join('-');

const commands: Array<[string, string[]]> = [
  ['list-routes', ['--json', '--roots', 'domain/*/api/src,apps/*/src']],
  ['verify-stynx-boundary', ['--json']],
  ['verify-api-coverage', ['--strict', '--json']],
  ['verify-openapi-contract', ['--json']],
  ['verify-public-api-baselines', ['--json']],
  ['verify-rls-negative', ['--json', '--ddl', 'database/ddl']],
];

const controller = `import { Body, Controller, Get, Post } from '@nestjs/common';
import { Permission } from '@stynx-nyx/auth';

export interface NoteDto {
  id: string;
  title: string;
}

export interface CreateNoteDto {
  title: string;
}

@Controller('notes')
export class NotesController {
  @Permission('notes:read')
  @Get()
  list(): NoteDto[] {
    return [];
  }

  @Permission('notes:write')
  @Post()
  create(@Body() input: CreateNoteDto): NoteDto {
    return { id: 'n-1', title: input.title };
  }
}
`;

const ddl = `CREATE TABLE notes.note (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  title text NOT NULL
);
ALTER TABLE notes.note ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes.note FORCE ROW LEVEL SECURITY;
CREATE POLICY note_tenant ON notes.note
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
`;

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

async function createConsumer(root: string): Promise<void> {
  write(
    root,
    'package.json',
    '{ "name": "consumer-fixture", "private": true, "type": "module" }\n',
  );
  write(
    root,
    '.stynxrc.json',
    `${JSON.stringify(
      {
        boundary: { roots: ['domain'], allowedPackages: ['@stynx-nyx/'] },
        apiCoverage: { sourceRoots: ['domain/notes/api/src'], openapiPath: 'docs/openapi.json' },
        publicApi: { packageRoots: ['packages'], baselinePath: 'docs/public-api-baselines.json' },
      },
      null,
      2,
    )}\n`,
  );
  write(
    root,
    'domain/notes/api/package.json',
    '{ "name": "@consumer/notes-api", "private": true }\n',
  );
  write(root, 'domain/notes/api/src/notes.controller.ts', controller);
  write(
    root,
    'packages/notes-sdk/package.json',
    '{ "name": "@consumer/notes-sdk", "version": "1.0.0", "exports": { ".": { "types": "./dist/index.d.ts" } } }\n',
  );
  write(
    root,
    'packages/notes-sdk/dist/index.d.ts',
    'export declare function listNotes(): Promise<string[]>;\n',
  );
  write(root, 'database/ddl/01-notes.sql', ddl);
  // The consumer's committed generate-pair outputs, produced by the same engines' write forms.
  const coverage = (await import(pathToFileURL(join(engines, 'api-coverage.mjs')).href)) as {
    verifyApiCoverage(options: { root: string; writeOpenApi: boolean }): unknown;
  };
  coverage.verifyApiCoverage({ root, writeOpenApi: true });
  rmSync(join(root, 'docs/framework'), { recursive: true, force: true });
  const baselines = (await import(
    pathToFileURL(join(engines, 'public-api-baselines.mjs')).href
  )) as {
    discoverPackages(root: string, roots: string[]): unknown[];
    currentBaselines(root: string, specs: unknown[]): unknown;
  };
  const specs = baselines.discoverPackages(root, ['packages']);
  write(
    root,
    'docs/public-api-baselines.json',
    `${JSON.stringify(baselines.currentBaselines(root, specs), null, 2)}\n`,
  );
  git(root, 'init', '--quiet');
  git(root, 'add', '--all');
  git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  );
}

function run(root: string, command: string, args: string[]) {
  const result = spawnSync(process.execPath, [cli, command, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  expect(String(result.error ?? 'none')).toBe('none');
  expect(String(result.signal)).toBe('null');
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parsed(stdout: string): Record<string, unknown> & {
  findings: Array<{ locator: string; message: string }>;
} {
  const value: unknown = JSON.parse(stdout);
  expect(typeof value === 'object' && value !== null && !Array.isArray(value)).toBe(true);
  return value as Record<string, unknown> & {
    findings: Array<{ locator: string; message: string }>;
  };
}

describe('stynx check entry points from a consumer root', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx-check-consumer-'));
  const clean = join(workspace, 'clean');

  beforeAll(async () => {
    mkdirSync(clean);
    await createConsumer(clean);
  });
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it('runs all six on the clean consumer: exit 0, one JSON object each, nothing written', () => {
    for (const [command, args] of commands) {
      const result = run(clean, command, args);
      expect(result.status, `${command}\n${result.stdout}\n${result.stderr}`).toBe(0);
      const report = parsed(result.stdout);
      expect(report).toMatchObject({ schemaVersion: '1', command, status: 'PASS', findings: [] });
      expect((report.counts as { observed: number }).observed).toBeGreaterThan(0);
    }
    expect(git(clean, 'status', '--porcelain', '--ignored', '--untracked-files=all')).toBe('');
  });

  it('reports a non-empty scanned-file census for the boundary', () => {
    const report = parsed(run(clean, 'verify-stynx-boundary', ['--json']).stdout);
    expect(report.scanned).toEqual(['domain/notes/api/src/notes.controller.ts']);
  });

  const seeded: Array<{
    command: string;
    seed: (root: string) => void;
    locator: RegExp;
    message: RegExp;
  }> = [
    {
      command: 'list-routes',
      seed: (root) =>
        write(
          root,
          'domain/notes/api/src/computed.controller.ts',
          "import { Controller, Get } from '@nestjs/common';\n\n@Controller('computed')\nexport class ComputedController {\n  @Get(routePath())\n  list() {\n    return [];\n  }\n}\n",
        ),
      locator: /^domain\/notes\/api\/src\/computed\.controller\.ts:5$/u,
      message: /unsupported computed route selector routePath\(\)/u,
    },
    {
      command: 'verify-stynx-boundary',
      seed: (root) => unlinkSync(join(root, '.stynxrc.json')),
      locator: /^\.stynxrc\.json:1$/u,
      message: /\.stynxrc\.json is missing/u,
    },
    {
      command: 'verify-stynx-boundary',
      seed: (root) =>
        write(
          root,
          'domain/notes/api/src/seam.ts',
          `export const a = 1;\nimport { b } from '${undeclaredSeam}';\n`,
        ),
      locator: /^domain\/notes\/api\/src\/seam\.ts:2$/u,
      message: /imports undeclared STYNX seam @stynx-internal\/data/u,
    },
    {
      command: 'verify-api-coverage',
      seed: (root) =>
        write(
          root,
          'domain/notes/api/src/notes.controller.ts',
          controller.replace(
            "  @Permission('notes:write')\n  @Post()",
            "  @Permission('notes:read')\n  @Get('archived')\n  archived(): NoteDto[] {\n    return [];\n  }\n\n  @Permission('notes:write')\n  @Post()",
          ),
        ),
      locator: /^domain\/notes\/api\/src\/notes\.controller\.ts:21$/u,
      message: /\/notes\/archived operation not in docs\/openapi\.json/u,
    },
    {
      command: 'verify-openapi-contract',
      seed: (root) => {
        const path = join(root, 'docs/openapi.json');
        const contract = JSON.parse(readFileSync(path, 'utf8')) as {
          paths: Record<string, Record<string, { operationId?: string }>>;
        };
        delete contract.paths['/notes']!['get']!.operationId;
        writeFileSync(path, `${JSON.stringify(contract, null, 2)}\n`);
      },
      locator: /^docs\/openapi\.json:\d+$/u,
      message: /^GET \/notes: missing operationId$/u,
    },
    {
      command: 'verify-public-api-baselines',
      seed: (root) =>
        write(
          root,
          'packages/notes-sdk/dist/index.d.ts',
          'export declare function listNotes(): Promise<number[]>;\n',
        ),
      locator: /^docs\/public-api-baselines\.json:4$/u,
      message: /^@consumer\/notes-sdk: public declaration changed index\.d\.ts$/u,
    },
    {
      command: 'verify-rls-negative',
      seed: (root) =>
        write(
          root,
          'database/ddl/02-tags.sql',
          '-- tags\nCREATE TABLE notes.tag (\n  id uuid PRIMARY KEY,\n  tenant_id uuid NOT NULL\n);\n',
        ),
      locator: /^database\/ddl\/02-tags\.sql:2$/u,
      message: /^notes\.tag: missing ENABLE ROW LEVEL SECURITY$/u,
    },
  ];

  for (const [index, { command, seed, locator, message }] of seeded.entries()) {
    it(`${command}: seeded violation ${index} exits 1 with a locator`, () => {
      const root = join(workspace, `seeded-${index}`);
      cpSync(clean, root, { recursive: true });
      seed(root);
      const [, args] = commands.find(([name]) => name === command)!;
      const result = run(root, command, args);
      expect(result.status, result.stdout).toBe(1);
      const report = parsed(result.stdout);
      expect(report.status).toBe('FAIL');
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            locator: expect.stringMatching(locator),
            message: expect.stringMatching(message),
          }),
        ]),
      );
    });
  }

  it('reports could-not-observe (exit 2) when baselines meet an unbuilt package', async () => {
    const root = join(workspace, 'unbuilt');
    cpSync(clean, root, { recursive: true });
    rmSync(join(root, 'packages/notes-sdk/dist'), { recursive: true });
    const report = await runCheck('verify-public-api-baselines', {}, root);
    expect(report).toMatchObject({ status: 'UNKNOWN', reason: 'prerequisite-failed' });
    expect(report.findings[0]?.locator).toBe('packages/notes-sdk/package.json:1');
    expect(exitCodeFor(report)).toBe(2);
  });

  it('runs the same reports in-process and renders a text form', async () => {
    for (const name of checkCommandNames) {
      const options = name === 'verify-api-coverage' ? { strict: true } : {};
      const report = await runCheck(
        name,
        name === 'list-routes' ? { roots: 'domain/*/api/src' } : options,
        clean,
      );
      expect(report.status, JSON.stringify(report.findings)).toBe('PASS');
      expect(formatCheckText(report)).toMatch(
        new RegExp(`^${name}: PASS observed \\d+/\\d+\\n$`, 'u'),
      );
    }
    const missing = await runCheck('verify-openapi-contract', {}, workspace);
    expect(missing.findings[0]).toMatchObject({
      locator: 'docs/framework/contracts/openapi.json:1',
    });
    expect(formatCheckText(missing)).toMatch(/OpenAPI document is missing \[S-22\]/u);
  });

  it('rejects an invalid .stynxrc.json section as config-invalid (exit 2)', async () => {
    const root = join(workspace, 'invalid-config');
    cpSync(clean, root, { recursive: true });
    write(root, '.stynxrc.json', '{ "rlsNegative": { "coveragePath": 7 } }\n');
    const report = await runCheck('verify-rls-negative', {}, root);
    expect(report).toMatchObject({ status: 'UNKNOWN', reason: 'config-invalid' });
    expect(exitCodeFor(report)).toBe(2);
  });
});
