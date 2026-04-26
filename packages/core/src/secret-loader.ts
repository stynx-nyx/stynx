import {
  GetSecretValueCommand,
  SecretsManagerClient,
  type SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { SecretLoadError } from './errors';
import type { StynxCoreModuleOptions } from './config';
import { STYNX_CORE_OPTIONS } from './tokens';

interface CachedSecret {
  value: string;
  expiresAt: number;
}

function isConnectionErrorLike(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /(ECONN|socket|connect|timeout|network)/i.test(error.message);
}

@Injectable()
export class SecretLoader {
  private readonly cache = new Map<string, CachedSecret>();
  private readonly ttlMs: number;
  private readonly client: SecretsManagerClient;

  constructor(
    @Optional()
    @Inject(STYNX_CORE_OPTIONS)
    options?: StynxCoreModuleOptions,
  ) {
    this.ttlMs = options?.secretCacheTtlMs ?? 5 * 60 * 1000;
    const secretsClientConfig = (options as StynxCoreModuleOptions & {
      secretsClientConfig?: SecretsManagerClientConfig;
    })?.secretsClientConfig;
    this.client = secretsClientConfig
      ? new SecretsManagerClient(secretsClientConfig)
      : new SecretsManagerClient();
  }

  async getSecretString(secretId: string, forceRefresh = false): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(secretId);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.value;
    }

    try {
      const response = await this.client.send(
        new GetSecretValueCommand({
          SecretId: secretId,
        }),
      );

      const secret = response.SecretString;
      if (typeof secret !== 'string' || secret.length === 0) {
        throw new Error('SecretString is empty');
      }

      this.cache.set(secretId, {
        value: secret,
        expiresAt: now + this.ttlMs,
      });
      return secret;
    } catch (error) {
      throw new SecretLoadError(secretId, error);
    }
  }

  invalidate(secretId: string): void {
    this.cache.delete(secretId);
  }

  async withConnectionErrorRefresh<T>(
    secretId: string,
    run: (secret: string) => Promise<T>,
  ): Promise<T> {
    const current = await this.getSecretString(secretId);
    try {
      return await run(current);
    } catch (error) {
      if (!isConnectionErrorLike(error)) {
        throw error;
      }
      this.invalidate(secretId);
      const refreshed = await this.getSecretString(secretId, true);
      return run(refreshed);
    }
  }
}
