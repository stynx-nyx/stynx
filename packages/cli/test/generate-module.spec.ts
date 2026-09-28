/** INV-CLI-001, INV-CLI-002, INV-CLI-003, INV-CLI-004: CTG-0008 independent CLI sensors. */
import { createHash } from 'node:crypto';
import {
  existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';
import { buildProgram } from '../src/cli';

type Blueprint = Record<string, any>;
const sampleBytes = readFileSync(join(__dirname, 'fixtures/BP-OPS-EXAMPLE-001.json'));
const sample: Blueprint = JSON.parse(sampleBytes.toString('utf8'));

const roots: string[] = [];
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'stynx-cli-generator-'));
  roots.push(root);
  return root;
}
function input(root: string, blueprint: Blueprint = sample): string {
  const file = join(root, 'blueprint.json');
  writeFileSync(file, blueprint === sample ? sampleBytes : JSON.stringify(blueprint));
  return file;
}
async function invoke(args: string[]): Promise<void> {
  const program = buildProgram();
  program.exitOverride();
  await program.parseAsync(args, { from: 'user' });
}
async function generate(root: string, blueprint: Blueprint = sample, out = join(root, 'out')): Promise<string> {
  await invoke(['generate', 'module', '--blueprint', input(root, blueprint), '--out', out]);
  return out;
}
async function mustRejectBehavior(action: Promise<unknown>): Promise<Error> {
  let thrown: unknown;
  try { await action; } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).not.toMatch(/unknown command/i);
  return thrown as Error;
}
function files(root: string): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else result.set(relative(root, path).replaceAll('\\', '/'), readFileSync(path));
    }
  }
  walk(root);
  return result;
}
function variation(change: (draft: Blueprint) => void): Blueprint {
  const draft = structuredClone(sample);
  change(draft);
  return draft;
}
function sqlFiles(out: string): string {
  return readFileSync(join(out, 'database/ops_example.sql'), 'utf8');
}
function migrationSchemas(): string[] {
  const repository = resolve(__dirname, '../../..');
  const migrationFiles: string[] = [];
  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith('.sql')) migrationFiles.push(path);
    }
  }
  for (const entry of readdirSync(join(repository, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(repository, 'packages', entry.name, 'migrations'));
  }
  walk(join(repository, 'database/migrations'));
  const found = new Set<string>();
  let dynamicCount = 0;
  for (const file of migrationFiles) {
    const sql = readFileSync(file, 'utf8');
    const declarations = [...sql.matchAll(/\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(?!(?:IF|NOT|EXISTS)\b)([a-z_][a-z_0-9]*)\b/gi)];
    for (const match of declarations) found.add(match[1]!.toLowerCase());
    const allCreate = [...sql.matchAll(/\bCREATE\s+SCHEMA\b/gi)].length;
    if (file.endsWith('000_migrate-check-preseed.sql')) {
      const literal = sql.match(/FOREACH\s+schema_name\s+IN\s+ARRAY\s+ARRAY\[([^\]]+)\]/i);
      const values = literal![1]!.split(',').map((part) => part.trim());
      expect(values, 'preseed schema array must remain finite and literal').toEqual([
        "'tenancy'", "'auth'", "'core'", "'audit'", "'data'", "'storage'", "'archive'", "'flow'", "'demo'", "'sample'",
      ]);
      expect(values.every((part) => /^'[a-z_][a-z_0-9]*'$/.test(part))).toBe(true);
      for (const value of values) found.add(value.slice(1, -1));
      expect(sql).toMatch(/EXECUTE\s+format\('CREATE SCHEMA IF NOT EXISTS %I',\s*schema_name\)/i);
      expect(allCreate, 'preseed must have exactly one dynamic CREATE SCHEMA tied to its literal array').toBe(declarations.length + 1);
      dynamicCount += 1;
    } else {
      expect(allCreate, `${file} contains a dynamic CREATE SCHEMA requiring review`).toBe(declarations.length);
    }
  }
  expect(dynamicCount).toBe(1);
  return [...found].sort();
}
async function rejectsWithoutOutput(blueprint: Blueprint): Promise<void> {
  const root = sandbox();
  const out = join(root, 'out');
  await mustRejectBehavior(generate(root, blueprint, out));
  expect(existsSync(out)).toBe(false);
  expect(readdirSync(root).sort()).toEqual(['blueprint.json']);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('stynx generate module command [INV-CLI-001]', () => {
  it('declares generate module with required blueprint/out and optional check, without force', () => {
    const generateCommand = buildProgram().commands.find((command) => command.name() === 'generate');
    const moduleCommand = generateCommand?.commands.find((command) => command.name() === 'module');
    expect(moduleCommand?.name()).toBe('module');
    expect(moduleCommand?.options.map((option) => [option.long, option.mandatory])).toEqual([
      ['--blueprint', true], ['--out', true], ['--check', false],
    ]);
    expect(moduleCommand?.options.some((option) => option.long === '--force')).toBe(false);
  });

  it('rejects missing options and malformed JSON before making output', async () => {
    const root = sandbox();
    await expect(invoke(['generate', 'module', '--out', join(root, 'out')])).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
    await expect(invoke(['generate', 'module', '--blueprint', input(root)])).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
    writeFileSync(join(root, 'blueprint.json'), '{"schemaVersion":', 'utf8');
    await mustRejectBehavior(invoke(['generate', 'module', '--blueprint', join(root, 'blueprint.json'), '--out', join(root, 'out')]));
    expect(existsSync(join(root, 'out'))).toBe(false);
  });

  it('generates the sample names, joined routes and exact permission keys', async () => {
    const root = sandbox();
    const out = await generate(root);
    expect([...files(out).keys()].sort()).toEqual([
      'database/ops_example.sql', 'generation-manifest.json', 'src/example.controller.ts',
      'src/example.module.ts', 'src/example.repository.ts', 'src/index.ts',
    ]);
    const controller = readFileSync(join(out, 'src/example.controller.ts'), 'utf8');
    expect(controller).toContain("@Permission('ops.example_record.list')");
    expect(controller).toContain("@Permission('ops.example_record.get')");
    expect(controller).toContain('/v1/example-records');
    expect(controller).not.toContain('/v1//example-records');
    expect(controller).not.toMatch(/@Public\b|@PublicTenantRoute\b|STYNX_PUBLIC_ROUTE/);
    expect(controller).not.toContain('example-records.list');
  });

  it('binds exactly one unique exact permission to every generated HTTP handler [INV-RBAC-001, INV-CLI-003]', async () => {
    const out = await generate(sandbox());
    const source = readFileSync(join(out, 'src/example.controller.ts'), 'utf8');
    const ast = ts.createSourceFile('example.controller.ts', source, ts.ScriptTarget.Latest, true);
    const httpNames = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
    const observed: string[] = [];
    const publicNames = new Set(['Public', 'PublicTenantRoute']);
    function decoratorCall(decorator: ts.Decorator): ts.CallExpression | undefined {
      return ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
    }
    function visit(node: ts.Node): void {
      if (ts.isMethodDeclaration(node)) {
        const calls = (ts.getDecorators(node) ?? []).map(decoratorCall).filter((call): call is ts.CallExpression => !!call);
        const names = calls.map((call) => call.expression.getText(ast));
        if (names.some((name) => httpNames.has(name))) {
          expect(names.some((name) => publicNames.has(name))).toBe(false);
          const permissions = calls.filter((call) => call.expression.getText(ast) === 'Permission');
          expect(permissions).toHaveLength(1);
          expect(permissions[0]?.arguments).toHaveLength(1);
          const argument = permissions[0]?.arguments[0];
          expect(argument && ts.isStringLiteral(argument)).toBe(true);
          if (argument && ts.isStringLiteral(argument)) observed.push(argument.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    expect(observed.sort()).toEqual(['ops.example_record.get', 'ops.example_record.list']);
    expect(new Set(observed).size).toBe(observed.length);
    expect(source).not.toMatch(/STYNX_PUBLIC_ROUTE|@Public\b|@PublicTenantRoute\b/);
    const allowlist = JSON.parse(readFileSync(resolve(__dirname, '../../../law/invariants/RBAC-001-allowlist.json'), 'utf8')) as {
      entries: Array<{ path: string }>;
    };
    expect(allowlist.entries.some((entry) => entry.path === '/v1/example-records')).toBe(false);
  });

  it('derives acronym slugs and omits the controller when api is absent', async () => {
    const root = sandbox();
    const blueprint = variation((b) => { b.module.name = 'HTTPServer2'; delete b.api; });
    const paths = [...files(await generate(root, blueprint)).keys()];
    expect(paths).toContain('src/http_server2.module.ts');
    expect(paths).toContain('src/http_server2.repository.ts');
    expect(paths).toContain('database/ops_http_server2.sql');
    expect(paths.some((path) => path.endsWith('.controller.ts'))).toBe(false);
  });

  it('treats accepted auth, audit and ops annotations as inert data', async () => {
    const annotated = sandbox();
    const bare = sandbox();
    const annotatedFiles = files(await generate(annotated));
    const bareFiles = files(await generate(bare, variation((b) => {
      delete b.auth; delete b.audit; delete b.ops;
    })));
    for (const path of ['src/example.controller.ts', 'src/example.repository.ts', 'database/ops_example.sql']) {
      const a = annotatedFiles.get(path)!.toString('utf8');
      const b = bareFiles.get(path)!.toString('utf8');
      expect(a).not.toMatch(/@Public\b|@PublicTenantRoute\b|STYNX_PUBLIC_ROUTE|GRANT .*technical-admin/i);
      expect(b).not.toMatch(/@Public\b|@PublicTenantRoute\b|STYNX_PUBLIC_ROUTE|GRANT .*technical-admin/i);
    }
  });

  it.each([
    ['unknown top-level key', (b: Blueprint) => { b.template = 'evil'; }],
    ['unsupported schema version', (b: Blueprint) => { b.schemaVersion = '2.0.0'; }],
    ['unsafe identifier', (b: Blueprint) => { b.module.name = '../Escape'; }],
    ['unicode identifier', (b: Blueprint) => { b.module.name = 'Éxample'; }],
    ['SQL token in table', (b: Blueprint) => { b.database.entities[0].table = 'record;drop'; }],
    ['raw SQL default', (b: Blueprint) => { b.database.entities[0].fields[2].default = 'current_user'; }],
    ['unsupported field type', (b: Blueprint) => { b.database.entities[0].fields[2].type = 'jsonb'; }],
    ['missing id', (b: Blueprint) => { b.database.entities[0].fields.shift(); }],
    ['altered id', (b: Blueprint) => { b.database.entities[0].fields[0].nullable = true; }],
    ['missing tenant', (b: Blueprint) => { b.database.entities[0].fields.splice(1, 1); }],
    ['altered tenant', (b: Blueprint) => { b.database.entities[0].fields[1].default = 'gen_random_uuid()'; }],
    ['duplicate index', (b: Blueprint) => { b.database.entities[0].indexes.push({ columns: ['tenant_id'] }); }],
    ['unsupported operation', (b: Blueprint) => { b.api.resources[0].operations = ['list', 'upsert']; }],
    ['unsupported metadata', (b: Blueprint) => { b.auth.rbac.guard = 'none'; }],
    ['path traversal', (b: Blueprint) => { b.api.resources[0].path = '/../admin'; }],
    ['duplicate route', (b: Blueprint) => { b.api.resources.push({ entity: 'ExampleRecord', path: '/example-records', operations: ['get'] }); }],
    ['duplicate permission key', (b: Blueprint) => { b.api.resources.push({ entity: 'ExampleRecord', path: '/other-records', operations: ['get'] }); }],
    ['case-fold entity collision', (b: Blueprint) => { b.database.entities.push({ ...structuredClone(b.database.entities[0]), name: 'EXAMPLERecord', table: 'other_record' }); }],
  ])('rejects %s before writing', async (_label, change) => {
    const root = sandbox();
    const out = join(root, 'out');
    const error = await mustRejectBehavior(generate(root, variation(change), out));
    expect(error.message).toMatch(/(?:\/|\b(?:schemaVersion|module|database|api|auth|audit|ops|id)\.)[A-Za-z_]/);
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(root).sort()).toEqual(['blueprint.json']);
  });

  it.each(['offline', 'demo', 'sample', 'public', 'information_schema', 'pg_catalog', 'pg_temp_42', 'select'])('rejects reserved schema %s', async (namespace) => {
    await rejectsWithoutOutput(variation((b) => { b.module.namespace = namespace; }));
  });

  it('rejects the exact finite platform migration schema inventory', async () => {
    const schemas = migrationSchemas();
    expect(schemas).toEqual([
      'archive', 'audit', 'auth', 'core', 'data', 'demo', 'flow', 'jobs',
      'notifications', 'offline', 'outbox', 'sample', 'storage', 'tenancy', 'worklist',
    ]);
    for (const namespace of schemas) {
      await rejectsWithoutOutput(variation((b) => { b.module.namespace = namespace; }));
    }
  });
});

describe('safe output and deterministic verification [INV-CLI-001, INV-CLI-002]', () => {
  it('refuses pre-existing file, empty directory and final-component symlink without changing bytes', async () => {
    for (const kind of ['file', 'directory', 'symlink']) {
      const root = sandbox();
      const out = join(root, 'out');
      const target = join(root, 'target');
      writeFileSync(target, 'sentinel', 'utf8');
      if (kind === 'file') writeFileSync(out, 'keep', 'utf8');
      if (kind === 'directory') mkdirSync(out);
      if (kind === 'symlink') symlinkSync(target, out);
      await mustRejectBehavior(generate(root, sample, out));
      expect(lstatSync(out).isSymbolicLink()).toBe(kind === 'symlink');
      expect(readFileSync(target, 'utf8')).toBe('sentinel');
      if (kind === 'file') expect(readFileSync(out, 'utf8')).toBe('keep');
      if (kind === 'directory') expect(readdirSync(out)).toEqual([]);
    }
  });

  it('rejects a symlink below the resolved parent but allows a symlinked ancestor', async () => {
    const root = sandbox();
    const realParent = join(root, 'real');
    mkdirSync(realParent);
    symlinkSync(realParent, join(root, 'ancestor'));
    expect(realpathSync(join(root, 'ancestor'))).toBe(realpathSync(realParent));
    await generate(root, sample, join(root, 'ancestor', 'generated'));
    expect(existsSync(join(realParent, 'generated/generation-manifest.json'))).toBe(true);
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    const nested = join(realParent, 'nested-link');
    symlinkSync(elsewhere, nested);
    await mustRejectBehavior(generate(root, sample, join(nested, 'escaped')));
    expect(existsSync(join(elsewhere, 'escaped'))).toBe(false);
  });

  it('produces identical bytes, sorted manifest entries and correct SHA-256 digests in independent destinations', async () => {
    const first = sandbox();
    const second = sandbox();
    const a = files(await generate(first));
    const b = files(await generate(second));
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
    for (const [path, bytes] of a) expect(bytes.equals(b.get(path)!)).toBe(true);
    const manifest = JSON.parse(a.get('generation-manifest.json')!.toString('utf8'));
    expect(JSON.stringify(manifest)).toContain(sample.id);
    expect(JSON.stringify(manifest)).toContain(createHash('sha256').update(readFileSync(join(first, 'blueprint.json'))).digest('hex'));
    const entries = Object.values(manifest).find((value): value is Array<{ path: string; sha256: string }> =>
      Array.isArray(value) && value.every((entry) => typeof entry.path === 'string' && typeof entry.sha256 === 'string'));
    expect(entries?.map((entry) => entry.path)).toEqual(
      [...a.keys()].filter((path) => path !== 'generation-manifest.json').sort(),
    );
    const listed = entries!;
    expect(listed.map((entry) => entry.path)).toEqual(listed.map((entry) => entry.path).sort());
    expect(listed.map((entry) => entry.path)).toEqual([...a.keys()].filter((path) => path !== 'generation-manifest.json').sort());
    for (const entry of listed) expect(entry.sha256).toBe(createHash('sha256').update(a.get(entry.path)!).digest('hex'));
  });

  it('checks existing output read-only and detects changed, missing, and extra files', async () => {
    const root = sandbox();
    const out = await generate(root);
    const blueprint = join(root, 'blueprint.json');
    const check = () => invoke(['generate', 'module', '--blueprint', blueprint, '--out', out, '--check']);
    const before = files(out);
    await check();
    for (const [path, bytes] of before) expect(readFileSync(join(out, path)).equals(bytes)).toBe(true);
    const source = join(out, 'src/example.module.ts');
    const original = readFileSync(source);
    writeFileSync(source, Buffer.concat([original, Buffer.from('// changed\n')]));
    await mustRejectBehavior(check());
    expect(readFileSync(source).equals(Buffer.concat([original, Buffer.from('// changed\n')]))).toBe(true);
    writeFileSync(source, original);
    rmSync(source);
    await mustRejectBehavior(check());
    expect(existsSync(source)).toBe(false);
    writeFileSync(source, original);
    writeFileSync(join(out, 'unexpected.txt'), 'extra');
    await mustRejectBehavior(check());
    expect(readFileSync(join(out, 'unexpected.txt'), 'utf8')).toBe('extra');
  });

  it('rejects an unparseable manifest and absent check destination without writing', async () => {
    const root = sandbox();
    const blueprint = input(root);
    const out = join(root, 'out');
    await mustRejectBehavior(invoke(['generate', 'module', '--blueprint', blueprint, '--out', out, '--check']));
    expect(existsSync(out)).toBe(false);
    await generate(root);
    writeFileSync(join(out, 'generation-manifest.json'), '{bad');
    await mustRejectBehavior(invoke(['generate', 'module', '--blueprint', blueprint, '--out', out, '--check']));
    expect(readFileSync(join(out, 'generation-manifest.json'), 'utf8')).toBe('{bad');
  });
});

describe('static SQL shape [INV-CLI-004]', () => {
  it('emits tenant-owned schema, qualified objects, force RLS, grants and both predicates', async () => {
    const out = await generate(sandbox());
    const sql = sqlFiles(out);
    expect(sql).toMatch(/CREATE SCHEMA\s+"?ops"?\s+AUTHORIZATION\s+stynx_owner/i);
    expect(sql).not.toMatch(/CREATE SCHEMA\s+IF NOT EXISTS/i);
    expect(sql).toMatch(/REVOKE ALL ON SCHEMA\s+"?ops"?\s+FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA\s+"?ops"?\s+TO\s+stynx_owner,\s*stynx_app,\s*stynx_reader/i);
    expect(sql).toMatch(/tenant_id"?\s+uuid\s+NOT NULL\s+REFERENCES\s+"?tenancy"?\."?tenants"?\s*\(\s*"?id"?\s*\)/i);
    expect(sql).toMatch(/CREATE INDEX[^;]+ON\s+"?ops"?\."?example_record"?[^;]+\(\s*"?tenant_id"?\s*\)/i);
    expect(sql).toMatch(/ALTER TABLE\s+"?ops"?\."?example_record"?\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/ALTER TABLE\s+"?ops"?\."?example_record"?\s+FORCE ROW LEVEL SECURITY/i);
    expect(sql.match(/NULLIF\s*\(\s*current_setting\s*\(\s*'app\.tenant_id'\s*,\s*true\s*\)\s*,\s*''\s*\)::uuid/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/USING\s*\(\s*"?tenant_id"?\s*=/i);
    expect(sql).toMatch(/WITH CHECK\s*\(\s*"?tenant_id"?\s*=/i);
    expect(sql).not.toMatch(/SECURITY DEFINER|BYPASSRLS/i);
    expect(sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\b/gi)).toHaveLength(1);
  });
});
