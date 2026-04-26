import { GetParametersByPathCommand, SSMClient, type SSMClientConfig } from '@aws-sdk/client-ssm';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';
import { ConfigurationValidationError } from './errors';
import { STYNX_CORE_CONFIG, STYNX_CORE_OPTIONS } from './tokens';

export interface StynxSsmOptions {
  enabled?: boolean;
  pathPrefix?: string;
  clientConfig?: SSMClientConfig;
}

export interface StynxCoreModuleOptions<TSchema extends ZodTypeAny = ZodTypeAny> {
  appName: string;
  envName?: string;
  schema: TSchema;
  defaults?: Partial<z.input<TSchema>>;
  ssm?: StynxSsmOptions;
  secretCacheTtlMs?: number;
}

export interface StynxCoreModuleAsyncOptions<TSchema extends ZodTypeAny = ZodTypeAny> {
  imports?: unknown[];
  inject?: unknown[];
  useFactory: (...args: unknown[]) =>
    | StynxCoreModuleOptions<TSchema>
    | Promise<StynxCoreModuleOptions<TSchema>>;
}

async function loadSsmValues(
  options: StynxCoreModuleOptions,
): Promise<Record<string, string>> {
  if (!options.ssm?.enabled) {
    return {};
  }

  const prefix =
    options.ssm.pathPrefix ??
    `/stynx/${options.envName ?? process.env.NODE_ENV ?? 'dev'}/${options.appName}/`;
  const client = options.ssm.clientConfig
    ? new SSMClient(options.ssm.clientConfig)
    : new SSMClient();
  const resolved: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const response = await client.send(
      new GetParametersByPathCommand({
        Path: prefix,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );

    for (const parameter of response.Parameters ?? []) {
      if (!parameter.Name || parameter.Value === undefined) {
        continue;
      }
      const key = parameter.Name.slice(prefix.length).split('/').filter(Boolean).pop();
      if (!key) {
        continue;
      }
      resolved[key] = parameter.Value;
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return resolved;
}

export async function loadStynxConfiguration<TSchema extends ZodTypeAny>(
  options: StynxCoreModuleOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const ssmValues = await loadSsmValues(options);
  const merged = {
    ...(options.defaults ?? {}),
    ...process.env,
    ...ssmValues,
  };
  const parsed = await options.schema.safeParseAsync(merged);
  if (!parsed.success) {
    throw new ConfigurationValidationError(parsed.error.issues);
  }
  return parsed.data;
}

@Injectable()
export class StynxConfigService<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    @Inject(STYNX_CORE_CONFIG)
    private readonly config: TConfig,
    @Optional()
    @Inject(STYNX_CORE_OPTIONS)
    private readonly options?: StynxCoreModuleOptions,
  ) {}

  get<K extends keyof TConfig>(key: K): TConfig[K] {
    return this.config[key];
  }

  get appName(): string | undefined {
    return this.options?.appName;
  }

  snapshot(): Readonly<TConfig> {
    return this.config;
  }
}
