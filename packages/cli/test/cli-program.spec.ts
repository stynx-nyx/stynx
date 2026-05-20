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
});
