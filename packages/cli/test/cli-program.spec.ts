const mocks = vi.hoisted(() => ({
  adoptApply: vi.fn(() => ({ generatedFiles: ['generated.ts'] })),
  adoptApplyProposedPermissions: vi.fn(() => 2),
  adoptScan: vi.fn(() => ({ report: true })),
  formatAdoptScanHuman: vi.fn(() => 'human report'),
  linkCognitoUsers: vi.fn(() => ({ matched: [{ userId: 'u1' }], unmatched: [] })),
  verifyAuditChain: vi.fn(async () => ({
    valid: true,
    totalChecked: 1,
    tenants: [{ tenantId: 'tenant-1', valid: true }],
  })),
  runDoctor: vi.fn(() => ({ stdout: 'doctor out', stderr: 'doctor err', exitCode: 3 })),
  scaffoldApp: vi.fn(),
  migrateDown: vi.fn(async () => ({ action: 'down' })),
  migrateRedo: vi.fn(async () => ({ action: 'redo' })),
  migrateUp: vi.fn(async () => ({ action: 'up' })),
  migrationStatus: vi.fn(async () => ({ action: 'status' })),
  generateRopaFromApp: vi.fn(() => 'ropa markdown'),
}));

vi.mock('../src/adopt', () => ({
  adoptApply: mocks.adoptApply,
  adoptApplyProposedPermissions: mocks.adoptApplyProposedPermissions,
  adoptScan: mocks.adoptScan,
  formatAdoptScanHuman: mocks.formatAdoptScanHuman,
  linkCognitoUsers: mocks.linkCognitoUsers,
}));

vi.mock('../src/audit', () => ({
  verifyAuditChain: mocks.verifyAuditChain,
}));

vi.mock('../src/doctor', () => ({
  runDoctor: mocks.runDoctor,
}));

vi.mock('../src/init', () => ({
  scaffoldApp: mocks.scaffoldApp,
}));

vi.mock('../src/migrate', () => ({
  migrateDown: mocks.migrateDown,
  migrateRedo: mocks.migrateRedo,
  migrateUp: mocks.migrateUp,
  migrationStatus: mocks.migrationStatus,
}));

vi.mock('../src/privacy-ropa', () => ({
  generateRopaFromApp: mocks.generateRopaFromApp,
}));

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { buildProgram } from '../src/cli';

async function runCli(args: string[]) {
  const program = buildProgram();
  program.exitOverride();
  await program.parseAsync(args, { from: 'user' });
}

function optionDefault(command: { options: Array<{ flags: string; defaultValue?: unknown }> } | undefined, flags: string): unknown {
  return command?.options.find((option) => option.flags === flags)?.defaultValue;
}

describe('buildProgram', () => {
  let stdout = '';
  let stderr = '';
  let logs: string[] = [];
  let originalExitCode: string | number | undefined;

  beforeEach(() => {
    stdout = '';
    stderr = '';
    logs = [];
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation((value?: unknown) => {
      logs.push(String(value));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  it('declares the expected command tree and option defaults', () => {
    const program = buildProgram();
    const commandNames = program.commands.map((command) => command.name());
    const migrate = program.commands.find((command) => command.name() === 'migrate');
    const adopt = program.commands.find((command) => command.name() === 'adopt');
    const init = program.commands.find((command) => command.name() === 'init');
    const audit = program.commands.find((command) => command.name() === 'audit');

    expect(program.name()).toBe('stynx');
    expect(commandNames).toEqual(['init', 'migrate', 'doctor', 'privacy', 'audit', 'adopt']);
    expect(migrate?.commands.map((command) => command.name())).toEqual(['status', 'up', 'down', 'redo']);
    expect(adopt?.commands.map((command) => command.name())).toEqual([
      'scan',
      'apply',
      'apply-proposed-permissions',
      'link-cognito-users',
    ]);
    expect(optionDefault(init, '--angular')).toBe(false);
    expect(optionDefault(init, '--dir <dir>')).toBe(process.cwd());
    expect(optionDefault(audit?.commands[0], '--limit <n>')).toBe('1000');
    expect(optionDefault(audit?.commands[0], '--format <format>')).toBe('human');
  });

  it('preserves exact command arguments, flags, descriptions, and defaults', () => {
    const program = buildProgram();
    const init = program.commands.find((command) => command.name() === 'init')!;
    const migrate = program.commands.find((command) => command.name() === 'migrate')!;
    const doctor = program.commands.find((command) => command.name() === 'doctor')!;
    const privacy = program.commands.find((command) => command.name() === 'privacy')!;
    const audit = program.commands.find((command) => command.name() === 'audit')!;
    const adopt = program.commands.find((command) => command.name() === 'adopt')!;

    expect(init.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
    }))).toEqual([{ name: 'app-name', required: true }]);
    expect(init.options.map((option) => ({
      flags: option.flags,
      description: option.description,
      defaultValue: option.defaultValue,
    }))).toEqual([
      { flags: '--angular', description: 'Scaffold Angular workspace files', defaultValue: false },
      { flags: '--dir <dir>', description: 'Output directory', defaultValue: process.cwd() },
    ]);
    expect(migrate.commands.map((command) => ({
      name: command.name(),
      options: command.options.map((option) => ({
        flags: option.flags,
        description: option.description,
        defaultValue: option.defaultValue,
        mandatory: option.mandatory,
      })),
    }))).toEqual([
      { name: 'status', options: [{ flags: '--database-url <url>', description: '', defaultValue: undefined, mandatory: true }] },
      { name: 'up', options: [
        { flags: '--database-url <url>', description: '', defaultValue: undefined, mandatory: true },
        { flags: '--dry', description: 'Dry-run pending list', defaultValue: false, mandatory: false },
      ] },
      { name: 'down', options: [
        { flags: '--database-url <url>', description: '', defaultValue: undefined, mandatory: true },
        { flags: '--steps <n>', description: 'How many applied migrations to roll back', defaultValue: '1', mandatory: false },
        { flags: '--dry', description: 'Dry-run rollback list', defaultValue: false, mandatory: false },
      ] },
      { name: 'redo', options: [
        { flags: '--database-url <url>', description: '', defaultValue: undefined, mandatory: true },
        { flags: '--dry', description: 'Dry-run redo plan', defaultValue: false, mandatory: false },
      ] },
    ]);
    expect(doctor.options.map((option) => [option.flags, option.description]))
      .toEqual([['--dir <dir>', 'Workspace directory']]);
    expect(privacy.commands[0]?.options.map((option) => [option.flags, option.description]))
      .toEqual([['--dir <dir>', 'App directory']]);
    expect(audit.commands[0]?.options.map((option) => [option.flags, option.description, option.defaultValue]))
      .toEqual([
        ['--database-url <url>', '', undefined],
        ['--tenant-id <uuid>', 'Verify a single tenant chain', undefined],
        ['--limit <n>', 'Maximum events to verify per tenant', '1000'],
        ['--format <format>', 'human or json', 'human'],
      ]);
    expect(adopt.commands.flatMap((command) => command.options.map((option) => option.description)))
      .toEqual([
        'json or human', 'Target directory',
        'Target directory', 'Report without writing',
        'Replacement pairs', 'Target directory',
        '', '', 'Only report matches',
      ]);
  });

  it('runs init, doctor, and privacy commands', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-program-'));

    await runCli(['init', 'demo', '--angular', '--dir', root]);
    expect(mocks.scaffoldApp).toHaveBeenCalledWith(resolve(root, 'demo'), 'demo', true);
    expect(logs.at(-1)).toBe(resolve(root, 'demo'));

    await runCli(['doctor', '--dir', root]);
    expect(mocks.runDoctor).toHaveBeenCalledWith(root);
    expect(stdout).toContain('doctor out');
    expect(stderr).toContain('doctor err');
    expect(process.exitCode).toBe(3);

    await runCli(['privacy', 'ropa', '--dir', root]);
    expect(mocks.generateRopaFromApp).toHaveBeenCalledWith(root);
    expect(stdout).toContain('ropa markdown');
  });

  it('runs migration commands and emits JSON output', async () => {
    await runCli(['migrate', 'status', '--database-url', 'postgres://db']);
    await runCli(['migrate', 'up', '--database-url', 'postgres://db', '--dry']);
    await runCli(['migrate', 'down', '--database-url', 'postgres://db', '--steps', '2', '--dry']);
    await runCli(['migrate', 'redo', '--database-url', 'postgres://db', '--dry']);

    expect(mocks.migrationStatus).toHaveBeenCalledWith(process.cwd(), 'postgres://db');
    expect(mocks.migrateUp).toHaveBeenCalledWith(process.cwd(), 'postgres://db', true);
    expect(mocks.migrateDown).toHaveBeenCalledWith(process.cwd(), 'postgres://db', 2, true);
    expect(mocks.migrateRedo).toHaveBeenCalledWith(process.cwd(), 'postgres://db', true);
    expect(logs.join('\n')).toContain('"action": "status"');
    expect(logs.join('\n')).toContain('"action": "redo"');
  });

  it('runs audit verification in json, valid-human, and broken-human modes', async () => {
    await runCli([
      'audit',
      'verify',
      '--database-url',
      'postgres://db',
      '--tenant-id',
      'tenant-1',
      '--limit',
      '5',
      '--format',
      'json',
    ]);
    expect(logs.at(-1)).toContain('"valid": true');
    expect(mocks.verifyAuditChain).toHaveBeenLastCalledWith('postgres://db', {
      tenantId: 'tenant-1',
      limit: 5,
    });

    await runCli(['audit', 'verify', '--database-url', 'postgres://db']);
    expect(logs.at(-1)).toContain('OK audit chain valid');

    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: false,
      totalChecked: 1,
      tenants: [{ tenantId: 'tenant-2', valid: false, firstBrokenEventId: 'event-1' }],
    });
    await runCli(['audit', 'verify', '--database-url', 'postgres://db']);
    expect(logs.at(-1)).toContain('BROKEN audit chain tenant=tenant-2 event=event-1');
    expect(process.exitCode).toBe(1);

    mocks.verifyAuditChain.mockResolvedValueOnce({
      valid: false,
      totalChecked: 0,
      tenants: [],
    });
    await runCli(['audit', 'verify', '--database-url', 'postgres://db']);
    expect(logs.at(-1)).toContain('BROKEN audit chain tenant=unknown event=unknown');
  });

  it('runs adoption scan/apply/link commands', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-adopt-program-'));
    const usersJson = resolve(root, 'users.yaml');
    const cognitoJson = resolve(root, 'cognito.yaml');
    writeFileSync(usersJson, '- id: u1\n  email: a@example.test\n', 'utf8');
    writeFileSync(cognitoJson, '- sub: sub1\n  email: a@example.test\n', 'utf8');

    await runCli(['adopt', 'scan', '--dir', root, '--format', 'human']);
    expect(mocks.formatAdoptScanHuman).toHaveBeenCalledWith({ report: true });
    expect(logs.at(-1)).toBe('human report');

    await runCli(['adopt', 'scan', '--dir', root, '--format', 'json']);
    expect(logs.at(-1)).toContain('"report": true');

    await runCli(['adopt', 'apply', '--dir', root, '--dry-run']);
    expect(mocks.adoptApply).toHaveBeenCalledWith(root, true);
    expect(logs.at(-1)).toContain('generated.ts');

    await runCli([
      'adopt',
      'apply-proposed-permissions',
      '--dir',
      root,
      '--replacement',
      `${'TODO'}_PERMISSION=records:write`,
    ]);
    expect(mocks.adoptApplyProposedPermissions).toHaveBeenCalledWith(root, {
      [`${'TODO'}_PERMISSION`]: 'records:write',
    });
    expect(logs.at(-1)).toBe('2');

    await runCli([
      'adopt',
      'link-cognito-users',
      '--users-json',
      usersJson,
      '--cognito-json',
      cognitoJson,
      '--dry-run',
    ]);
    expect(mocks.linkCognitoUsers).toHaveBeenCalledWith(
      [{ id: 'u1', email: 'a@example.test' }],
      [{ sub: 'sub1', email: 'a@example.test' }],
    );
    expect(logs.at(-1)).toContain('"matched"');
  });

  it('honors command defaults, recursive init paths, and repeated replacements', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-defaults-'));

    await runCli(['init', 'nested/demo', '--dir', root]);
    expect(mocks.scaffoldApp).toHaveBeenCalledWith(resolve(root, 'nested/demo'), 'nested/demo', false);

    await runCli(['adopt', 'scan', '--dir', root]);
    expect(logs.at(-1)).toContain('"report": true');
    expect(mocks.formatAdoptScanHuman).not.toHaveBeenCalled();

    await runCli(['adopt', 'apply', '--dir', root]);
    expect(mocks.adoptApply).toHaveBeenCalledWith(root, false);

    await runCli([
      'adopt', 'apply-proposed-permissions', '--dir', root,
      '--replacement', 'FIRST=one', '--replacement', 'SECOND=two',
    ]);
    expect(mocks.adoptApplyProposedPermissions).toHaveBeenCalledWith(root, {
      FIRST: 'one',
      SECOND: 'two',
    });
  });
});
