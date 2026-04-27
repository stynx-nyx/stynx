import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  adoptApply,
  adoptApplyProposedPermissions,
  adoptScan,
  formatAdoptScanHuman,
  linkCognitoUsers,
} from './adopt';
import { verifyAuditChain } from './audit';
import { runDoctor } from './doctor';
import { scaffoldApp } from './init';
import { migrateDown, migrateRedo, migrateUp, migrationStatus } from './migrate';
import { generateRopaFromApp } from './privacy-ropa';

export function buildProgram(): Command {
  const program = new Command();
  program.name('stynx');

  program
    .command('init')
    .argument('<app-name>')
    .option('--angular', 'Scaffold Angular workspace files', false)
    .option('--dir <dir>', 'Output directory', process.cwd())
    .action((appName, options) => {
      const targetDir = resolve(options.dir, appName);
      mkdirSync(targetDir, { recursive: true });
      scaffoldApp(targetDir, appName, options.angular);
      console.log(targetDir);
    });

  const migrate = program.command('migrate');
  migrate
    .command('status')
    .requiredOption('--database-url <url>')
    .action(async (options) => {
      console.log(JSON.stringify(await migrationStatus(process.cwd(), options.databaseUrl), null, 2));
    });
  migrate
    .command('up')
    .requiredOption('--database-url <url>')
    .option('--dry', 'Dry-run pending list', false)
    .action(async (options) => {
      console.log(JSON.stringify(await migrateUp(process.cwd(), options.databaseUrl, options.dry), null, 2));
    });
  migrate
    .command('down')
    .requiredOption('--database-url <url>')
    .option('--steps <n>', 'How many applied migrations to roll back', '1')
    .option('--dry', 'Dry-run rollback list', false)
    .action(async (options) => {
      console.log(JSON.stringify(await migrateDown(process.cwd(), options.databaseUrl, Number(options.steps), options.dry), null, 2));
    });
  migrate
    .command('redo')
    .requiredOption('--database-url <url>')
    .option('--dry', 'Dry-run redo plan', false)
    .action(async (options) => {
      console.log(JSON.stringify(await migrateRedo(process.cwd(), options.databaseUrl, options.dry), null, 2));
    });

  program
    .command('doctor')
    .option('--dir <dir>', 'Workspace directory', process.cwd())
    .action((options) => {
      const result = runDoctor(resolve(options.dir));
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      process.exitCode = result.exitCode;
    });

  const privacy = program.command('privacy');
  privacy
    .command('ropa')
    .option('--dir <dir>', 'App directory', process.cwd())
    .action((options) => {
      process.stdout.write(generateRopaFromApp(resolve(options.dir)));
    });

  const audit = program.command('audit');
  audit
    .command('verify')
    .requiredOption('--database-url <url>')
    .option('--tenant-id <uuid>', 'Verify a single tenant chain')
    .option('--limit <n>', 'Maximum events to verify per tenant', '1000')
    .option('--format <format>', 'human or json', 'human')
    .action(async (options) => {
      const result = await verifyAuditChain(options.databaseUrl, {
        tenantId: options.tenantId,
        limit: Number(options.limit),
      });
      if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.valid) {
        console.log(`OK audit chain valid (${result.totalChecked} event(s), ${result.tenants.length} tenant(s))`);
      } else {
        const broken = result.tenants.find((tenant) => !tenant.valid);
        console.log(`BROKEN audit chain tenant=${broken?.tenantId ?? 'unknown'} event=${broken?.firstBrokenEventId ?? 'unknown'}`);
      }
      process.exitCode = result.valid ? 0 : 1;
    });

  const adopt = program.command('adopt');
  adopt
    .command('scan')
    .option('--format <format>', 'json or human', 'json')
    .option('--dir <dir>', 'Target directory', process.cwd())
    .action((options) => {
      const report = adoptScan(resolve(options.dir));
      if (options.format === 'human') {
        console.log(formatAdoptScanHuman(report));
        return;
      }
      console.log(JSON.stringify(report, null, 2));
    });
  adopt
    .command('apply')
    .option('--dir <dir>', 'Target directory', process.cwd())
    .option('--dry-run', 'Report without writing', false)
    .action((options) => {
      console.log(JSON.stringify(adoptApply(resolve(options.dir), options.dryRun), null, 2));
    });
  adopt
    .command('apply-proposed-permissions')
    .requiredOption('--replacement <placeholder=value...>', 'Replacement pairs', (value, acc: string[] = []) => {
      acc.push(value);
      return acc;
    })
    .option('--dir <dir>', 'Target directory', process.cwd())
    .action((options) => {
      const replacements = Object.fromEntries(
        (options.replacement as string[]).map((entry) => {
          const [key, value] = entry.split('=');
          return [key, value];
        }),
      );
      console.log(adoptApplyProposedPermissions(resolve(options.dir), replacements));
    });
  adopt
    .command('link-cognito-users')
    .requiredOption('--users-json <path>')
    .requiredOption('--cognito-json <path>')
    .option('--dry-run', 'Only report matches', false)
    .action((options) => {
      const users = parse(readFileSync(resolve(options.usersJson), 'utf8')) as Array<{ id: string; email: string }>;
      const cognitoUsers = parse(readFileSync(resolve(options.cognitoJson), 'utf8')) as Array<{ sub: string; email: string }>;
      console.log(JSON.stringify(linkCognitoUsers(users, cognitoUsers), null, 2));
    });

  return program;
}
