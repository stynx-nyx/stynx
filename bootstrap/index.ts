#!/usr/bin/env ts-node
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import { loadEnv, writeBackendEnv, updateAngularEnvironments } from './lib/env';
import { createDatabase, dropDatabase, runSqlDirectory } from './lib/db';
import { ensureCognito, describeCognito, deleteAppClient, deleteGroups, deleteUserPool } from './lib/cognito';
import { ensureBucket, resolveBucketRegion } from './lib/s3';
import { ensureDistribution } from './lib/cloudfront';
import { buildFrontend, deployFrontend } from './lib/frontend';
import { buildBackend, deployBackendPlaceholder } from './lib/backend';
import { teardown } from './lib/teardown';
import { WORKSPACE_ROOT } from './lib/targets';

interface GlobalOptions {
  profile?: string;
  region?: string;
  dryRun?: boolean;
  yes?: boolean;
  nonInteractive?: boolean;
  debug?: boolean;
  force?: boolean;
  syncEnv?: boolean;
  syncEnvSource?: string;
}

interface EnvConfig {
  APP_NAME: string;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  PGHOST: string;
  PGPORT: string;
  AWS_REGION: string;
  AWS_PROFILE: string;
  FRONTEND_URL: string;
  API_BASE_URL: string;
  COGNITO_USERPOOL_ID?: string;
  COGNITO_CLIENT_ID?: string;
  COGNITO_JWKS_URI?: string;
  COGNITO_REGION?: string;
  S3_BUCKET_STORAGE?: string;
  S3_BUCKET_FRONTEND?: string;
  CLOUDFRONT_DIST_ID?: string;
  CLOUDFRONT_DOMAIN?: string;
}

const program = new Command();
program
  .name('stynx bootstrap')
  .description('Configure and bootstrap stynx infrastructure')
  .version('0.1.0')
  .option('--profile <name>', 'AWS profile to use')
  .option('--region <name>', 'AWS region', process.env.AWS_REGION || 'us-east-1')
  .option('--yes', 'Assume yes for all prompts', false)
  .option('--dry-run', 'Preview actions without executing', false)
  .option('--non-interactive', 'Disable interactive prompts', false)
  .option('--debug', 'Enable verbose logging', false)
  .option('--force', 'Force operations even when validations fail', false)
  .option('--sync-env', 'Automatically import missing variables from --sync-env-source path', false)
  .option('--sync-env-source <path>', 'Source .env path for optional sync', '../porm/backend/.env');

function getGlobalOptions(command: Command): GlobalOptions {
  const opts = command.parent?.opts?.() ?? command.opts?.() ?? {};
  return {
    profile: opts.profile,
    region: opts.region || process.env.AWS_REGION || 'us-east-1',
    dryRun: Boolean(opts.dryRun),
    yes: Boolean(opts.yes),
    nonInteractive: Boolean(opts.nonInteractive),
    debug: Boolean(opts.debug),
    force: Boolean(opts.force),
    syncEnv: Boolean(opts.syncEnv),
    syncEnvSource: opts.syncEnvSource || '../porm/backend/.env',
  };
}

async function ensureEnvConfig(global: GlobalOptions, existing: Partial<EnvConfig>): Promise<EnvConfig> {
  const existingRecord = existing as Record<string, string | undefined>;
  const defaults: EnvConfig = {
    APP_NAME: existing.APP_NAME || 'stynx',
    DB_NAME: existing.DB_NAME || 'stynx',
    DB_USER: existing.DB_USER || 'stynx_user',
    DB_PASSWORD: existing.DB_PASSWORD || 'change_me',
    PGHOST: existing.PGHOST || 'localhost',
    PGPORT: existing.PGPORT || '5432',
    AWS_REGION: existing.AWS_REGION || global.region || 'us-east-1',
    AWS_PROFILE: existing.AWS_PROFILE || global.profile || 'default',
    FRONTEND_URL: existing.FRONTEND_URL || 'http://localhost:4200',
    API_BASE_URL: existing.API_BASE_URL || 'http://localhost:3000',
    COGNITO_USERPOOL_ID: existing.COGNITO_USERPOOL_ID,
    COGNITO_CLIENT_ID: existing.COGNITO_CLIENT_ID,
    COGNITO_JWKS_URI: existing.COGNITO_JWKS_URI,
    COGNITO_REGION: existing.COGNITO_REGION || existing.AWS_REGION || global.region || 'us-east-1',
    S3_BUCKET_STORAGE: existing.S3_BUCKET_STORAGE,
    S3_BUCKET_FRONTEND: existing.S3_BUCKET_FRONTEND,
    CLOUDFRONT_DIST_ID: existing.CLOUDFRONT_DIST_ID,
    CLOUDFRONT_DOMAIN: existing.CLOUDFRONT_DOMAIN,
  };
  if (existingRecord?.COGNITO_CLIENT_SECRET) {
    // Cognito clients must be public; remove legacy secrets pulled from older environments.
    // eslint-disable-next-line no-console
    console.warn(chalk.yellow('Detected COGNITO_CLIENT_SECRET in backend env file; removing to enforce secret-less app clients.'));
    delete existingRecord.COGNITO_CLIENT_SECRET;
  }
  if (global.nonInteractive || global.yes) {
    defaults.COGNITO_REGION = defaults.AWS_REGION;
    return defaults;
  }
  const questions = [
    { name: 'APP_NAME', message: 'Application name', initial: defaults.APP_NAME },
    { name: 'DB_NAME', message: 'Database name', initial: defaults.DB_NAME },
    { name: 'DB_USER', message: 'Database user', initial: defaults.DB_USER },
    { name: 'DB_PASSWORD', message: 'Database password', initial: defaults.DB_PASSWORD },
    { name: 'PGHOST', message: 'PostgreSQL host', initial: defaults.PGHOST },
    { name: 'PGPORT', message: 'PostgreSQL port', initial: defaults.PGPORT },
    { name: 'AWS_REGION', message: 'AWS region', initial: defaults.AWS_REGION },
    { name: 'AWS_PROFILE', message: 'AWS profile', initial: defaults.AWS_PROFILE },
    { name: 'FRONTEND_URL', message: 'Frontend URL', initial: defaults.FRONTEND_URL },
    { name: 'API_BASE_URL', message: 'API base URL', initial: defaults.API_BASE_URL },
  ];
  const answers = await prompt<{ [key: string]: string }>(questions.map((question) => ({ type: 'input', ...question })));
  const result = { ...defaults, ...answers } as EnvConfig;
  result.COGNITO_REGION = result.AWS_REGION;
  return result;
}

function toDbConfig(env: EnvConfig) {
  return {
    host: env.PGHOST,
    port: parseInt(env.PGPORT, 10) || 5432,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  };
}

const SECRET_KEY_REGEX = /secret|password|token|key|credential/i;
const UNSUPPORTED_PORM_KEYS = new Set(['COGNITO_CLIENT_SECRET']);

function maskValue(key: string, value: string | undefined): string {
  if (!value) return '';
  if (!SECRET_KEY_REGEX.test(key)) {
    return value;
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
}

async function reconcileWithSyncSourceEnv(env: EnvConfig, global: GlobalOptions): Promise<void> {
  const sourceEnvPath = path.resolve(WORKSPACE_ROOT, global.syncEnvSource || '../porm/backend/.env');
  let pormVars: Record<string, string>;
  try {
    pormVars = await loadEnv(sourceEnvPath);
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      if (global.debug) {
        // eslint-disable-next-line no-console
        console.log(chalk.gray(`sync source .env not found at ${sourceEnvPath}`));
      }
      return;
    }
    throw err;
  }
  const envRecord = env as unknown as Record<string, string | undefined>;
  const missing = Object.keys(pormVars).filter((key) => !envRecord[key]);
  if (missing.length === 0) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(chalk.yellow(`Detected missing environment variables compared to ${sourceEnvPath}:`));
  for (const key of missing) {
    // eslint-disable-next-line no-console
    console.log(`  ${key} (porm value: ${maskValue(key, pormVars[key])})`);
  }
  const shouldAutoSync = global.syncEnv || global.yes;
  if (!shouldAutoSync && global.nonInteractive) {
    return;
  }
  for (const key of missing) {
    let copy = shouldAutoSync;
    if (!copy && !global.nonInteractive) {
      const answer = await prompt<{ import: boolean }>([
        {
          type: 'confirm',
          name: 'import',
          message: `Import ${key} from sync source environment?`,
          initial: true,
        },
      ]);
      copy = answer.import;
    }
    if (copy) {
      if (UNSUPPORTED_PORM_KEYS.has(key)) {
        // eslint-disable-next-line no-console
        console.warn(chalk.yellow(`Skipping ${key} import to enforce public Cognito app clients.`));
        continue;
      }
      envRecord[key] = pormVars[key];
    }
  }
}

async function persistEnv(env: EnvConfig, global: GlobalOptions): Promise<void> {
  env.COGNITO_REGION = env.AWS_REGION;
  await reconcileWithSyncSourceEnv(env, global);
  delete (env as unknown as Record<string, unknown>).COGNITO_CLIENT_SECRET;
  const payload: Record<string, string | undefined> = {
    ...env,
    COGNITO_CLIENT_SECRET: undefined,
  };
  await writeBackendEnv(payload, { dryRun: global.dryRun, debug: global.debug });
  await updateAngularEnvironments(
    {
      apiBaseUrl: env.API_BASE_URL,
      frontendUrl: env.FRONTEND_URL,
      cognito: {
        region: env.COGNITO_REGION,
        userPoolId: env.COGNITO_USERPOOL_ID,
        clientId: env.COGNITO_CLIENT_ID,
        redirectUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/login/callback`,
        logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
      },
      storageBucket: env.S3_BUCKET_STORAGE,
      cloudfrontDomain: env.CLOUDFRONT_DOMAIN,
    },
    { dryRun: global.dryRun, debug: global.debug },
  );
}

program
  .command('configure')
  .description('Interactively configure environment variables for stynx')
  .action(async function action(this: Command) {
    const global = getGlobalOptions(this as Command);
    const existing = await loadEnv();
    const envConfig = await ensureEnvConfig(global, existing as Partial<EnvConfig>);
    await persistEnv(envConfig, global);
    // eslint-disable-next-line no-console
    console.log(chalk.green('Environment configuration complete.'));
  });

program
  .command('db')
  .description('Apply database DDL/seed scripts')
  .option('--recreate', 'Drop and recreate database before applying DDL', false)
  .option('--seed', 'Apply seed scripts after DDL', false)
  .action(async function action(this: Command, options: { recreate?: boolean; seed?: boolean }) {
    const global = getGlobalOptions(this as Command);
    const envVars = await loadEnv();
    const env = await ensureEnvConfig(global, envVars as Partial<EnvConfig>);
    const dbConfig = { ...toDbConfig(env), password: env.DB_PASSWORD };
    if (options.recreate) {
      await dropDatabase(dbConfig, { dryRun: global.dryRun, debug: global.debug });
      await createDatabase(dbConfig, { dryRun: global.dryRun, debug: global.debug });
    }
    await runSqlDirectory(dbConfig, path.resolve(WORKSPACE_ROOT, 'db/ddl'), { dryRun: global.dryRun, debug: global.debug });
    if (options.seed) {
      await runSqlDirectory(dbConfig, path.resolve(WORKSPACE_ROOT, 'db/seed'), { dryRun: global.dryRun, debug: global.debug });
    }
  });

program
  .command('up')
  .description('Provision core infrastructure (Cognito, S3, CloudFront)')
  .option('--with-s3', 'Ensure S3 buckets exist', false)
  .option('--with-cloudfront', 'Ensure CloudFront distribution exists', false)
  .option('--with-db', 'Prepare database schema', false)
  .option('--delete-userpool', 'Delete user pool before provisioning', false)
  .option('--delete-client', 'Delete app client before provisioning', false)
  .option('--delete-groups', 'Delete Cognito groups before provisioning', false)
  .action(async function action(this: Command, opts: { withS3?: boolean; withCloudfront?: boolean; withDb?: boolean; deleteUserpool?: boolean; deleteClient?: boolean; deleteGroups?: boolean }) {
    const global = getGlobalOptions(this as Command);
    const envVars = await loadEnv();
    const env = await ensureEnvConfig(global, envVars as Partial<EnvConfig>);

    if (opts.deleteUserpool && env.COGNITO_USERPOOL_ID) {
      await deleteUserPool({
        appName: env.APP_NAME,
        frontendUrl: env.FRONTEND_URL,
        logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
      }, env.COGNITO_USERPOOL_ID);
      env.COGNITO_USERPOOL_ID = undefined;
    }
    if (opts.deleteClient && env.COGNITO_USERPOOL_ID && env.COGNITO_CLIENT_ID) {
      await deleteAppClient({
        appName: env.APP_NAME,
        frontendUrl: env.FRONTEND_URL,
        logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
      }, env.COGNITO_USERPOOL_ID, env.COGNITO_CLIENT_ID);
      env.COGNITO_CLIENT_ID = undefined;
    }
    if (opts.deleteGroups && env.COGNITO_USERPOOL_ID) {
      await deleteGroups({
        appName: env.APP_NAME,
        frontendUrl: env.FRONTEND_URL,
        logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
      }, env.COGNITO_USERPOOL_ID);
    }

    const cognito = await ensureCognito({
      appName: env.APP_NAME,
      frontendUrl: env.FRONTEND_URL,
      logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
      region: global.region || env.AWS_REGION,
      profile: global.profile || env.AWS_PROFILE,
      dryRun: global.dryRun,
      debug: global.debug,
      force: global.force,
    });
    env.COGNITO_USERPOOL_ID = cognito.userPoolId;
    env.COGNITO_CLIENT_ID = cognito.appClientId;
    env.COGNITO_JWKS_URI = cognito.jwksUri;
    env.COGNITO_REGION = global.region || env.AWS_REGION;

    if (opts.withS3 || global.yes) {
      const storageBucket = `${env.APP_NAME}-storage`.toLowerCase();
      const frontendBucket = `${env.APP_NAME}-frontend`.toLowerCase();
      await ensureBucket({
        appName: env.APP_NAME,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
        bucketName: storageBucket,
      });
      await ensureBucket({
        appName: env.APP_NAME,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
        bucketName: frontendBucket,
        website: true,
      });
      env.S3_BUCKET_STORAGE = storageBucket;
      env.S3_BUCKET_FRONTEND = frontendBucket;
    }

    if (opts.withCloudfront) {
      if (!env.S3_BUCKET_FRONTEND) {
        throw new Error('Frontend bucket required for CloudFront. Run with --with-s3 first.');
      }
      const cf = await ensureDistribution({
        appName: env.APP_NAME,
        bucketDomain: `${env.S3_BUCKET_FRONTEND}.s3.amazonaws.com`,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
        aliases: [env.FRONTEND_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')],
      });
      env.CLOUDFRONT_DIST_ID = cf.distributionId;
      env.CLOUDFRONT_DOMAIN = cf.domainName;
    }

    if (opts.withDb) {
      const dbConfig = { ...toDbConfig(env), password: env.DB_PASSWORD };
      await runSqlDirectory(dbConfig, path.resolve(WORKSPACE_ROOT, 'db/ddl'), { dryRun: global.dryRun, debug: global.debug });
    }

    await persistEnv(env, global);
  });

program
  .command('deploy-frontend')
  .description('Build and deploy frontend assets to S3')
  .option('--invalidate', 'Invalidate CloudFront cache after upload', false)
  .action(async function action(this: Command, opts: { invalidate?: boolean }) {
    const global = getGlobalOptions(this as Command);
    const envVars = await loadEnv();
    const env = await ensureEnvConfig(global, envVars as Partial<EnvConfig>);
    if (!env.S3_BUCKET_FRONTEND) {
      if (global.dryRun) {
        env.S3_BUCKET_FRONTEND = `${env.APP_NAME}-frontend`.toLowerCase();
      } else {
        throw new Error('S3_BUCKET_FRONTEND missing. Run `up --with-s3 --with-cloudfront` first.');
      }
    }
    await buildFrontend({
      appName: env.APP_NAME,
      region: global.region || env.AWS_REGION,
      profile: global.profile || env.AWS_PROFILE,
      dryRun: global.dryRun,
      debug: global.debug,
      bucketName: env.S3_BUCKET_FRONTEND,
    });
    const result = await deployFrontend({
      appName: env.APP_NAME,
      region: global.region || env.AWS_REGION,
      profile: global.profile || env.AWS_PROFILE,
      dryRun: global.dryRun,
      debug: global.debug,
      bucketName: env.S3_BUCKET_FRONTEND,
      distributionId: env.CLOUDFRONT_DIST_ID,
      distributionDomain: env.CLOUDFRONT_DOMAIN,
      invalidate: opts.invalidate,
    });
    if (!global.dryRun) {
      // eslint-disable-next-line no-console
      console.log(chalk.green(`Frontend deployed to s3://${result.bucket}`));
      if (result.distributionDomain) {
        // eslint-disable-next-line no-console
        console.log(chalk.green(`CloudFront domain: https://${result.distributionDomain}`));
      }
    }
  });

program
  .command('deploy-backend')
  .description('Build backend and emit placeholder deployment instructions for EC2')
  .option('--deploy-ec2', 'Trigger EC2 deployment placeholder', false)
  .action(async function action(this: Command, opts: { deployEc2?: boolean }) {
    const global = getGlobalOptions(this as Command);
    await buildBackend({ dryRun: global.dryRun, debug: global.debug });
    if (opts.deployEc2) {
      await deployBackendPlaceholder({ dryRun: global.dryRun, debug: global.debug });
    }
  });

program
  .command('sync')
  .description('Synchronize environment files with live AWS resources')
  .action(async function action(this: Command) {
    const global = getGlobalOptions(this as Command);
    const envVars = await loadEnv();
    const env = await ensureEnvConfig(global, envVars as Partial<EnvConfig>);
    if (env.COGNITO_USERPOOL_ID && env.COGNITO_CLIENT_ID) {
      const summary = await describeCognito({
        appName: env.APP_NAME,
        frontendUrl: env.FRONTEND_URL,
        logoutUrl: `${env.FRONTEND_URL.replace(/\/$/, '')}/logout`,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
        force: global.force,
      }, env.COGNITO_USERPOOL_ID, env.COGNITO_CLIENT_ID);
      env.COGNITO_JWKS_URI = summary.jwksUri;
    }
    if (env.S3_BUCKET_FRONTEND) {
      await resolveBucketRegion({
        appName: env.APP_NAME,
        region: global.region || env.AWS_REGION,
        profile: global.profile || env.AWS_PROFILE,
        dryRun: global.dryRun,
        debug: global.debug,
        bucketName: env.S3_BUCKET_FRONTEND,
        website: true,
      });
    }
    await persistEnv(env, global);
  });

program
  .command('teardown')
  .description('Remove provisioned infrastructure')
  .option('--with-db', 'Drop database after tearing down cloud resources', false)
  .action(async function action(this: Command, opts: { withDb?: boolean }) {
    const global = getGlobalOptions(this as Command);
    const envVars = await loadEnv();
    const env = await ensureEnvConfig(global, envVars as Partial<EnvConfig>);
    await teardown({
      appName: env.APP_NAME,
      region: global.region || env.AWS_REGION,
      profile: global.profile || env.AWS_PROFILE,
      dryRun: global.dryRun,
      debug: global.debug,
      userPoolId: env.COGNITO_USERPOOL_ID,
      appClientId: env.COGNITO_CLIENT_ID,
      storageBucket: env.S3_BUCKET_STORAGE,
      frontendBucket: env.S3_BUCKET_FRONTEND,
      cloudfrontId: env.CLOUDFRONT_DIST_ID,
      deleteDb: opts.withDb,
      db: opts.withDb ? { ...toDbConfig(env), password: env.DB_PASSWORD } : undefined,
    });
  });

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  program.parseAsync(process.argv);
}
