import { fromIni } from '@aws-sdk/credential-providers';
import chalk from 'chalk';

export interface AwsContextOptions {
  region: string;
  profile?: string;
  debug?: boolean;
  dryRun?: boolean;
  appName: string;
}

export function baseAwsConfig<T extends Record<string, unknown>>(ctx: AwsContextOptions, extra: T = {} as T): T & { region: string } {
  const config: Record<string, unknown> = { ...extra, region: ctx.region };
  if (ctx.profile) {
    config.credentials = fromIni({ profile: ctx.profile });
  }
  return config as T & { region: string };
}

export function logAws(ctx: AwsContextOptions, message: string) {
  if (ctx.debug) {
    // eslint-disable-next-line no-console
    console.log(chalk.gray(`[aws:${ctx.region}${ctx.profile ? `:${ctx.profile}` : ''}] ${message}`));
  }
}

export function defaultTags(appName: string): Record<string, string> {
  return {
    App: appName,
    Project: 'st-core',
  };
}

export function ensureDryRun(ctx: AwsContextOptions, action: string): boolean {
  if (!ctx.dryRun) {
    return false;
  }
  // eslint-disable-next-line no-console
  console.log(chalk.yellow(`dry-run: skipping ${action}`));
  return true;
}
