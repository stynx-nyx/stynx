import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database } from '@stynx/data';
import { STYNX_RATE_LIMIT_OPTIONS } from './constants';
import type {
  RateLimitGuardOptions,
  RateLimitMetadata,
  RateLimitPolicyResolver,
  ResolvedRateLimitPolicy,
} from './types';
import type { RequestLike } from './request-context';

interface ConfigRow {
  value: {
    limit?: number;
    windowSeconds?: number;
  };
}

interface OverrideRow {
  limit_value: number;
  window_seconds: number;
}

@Injectable()
export class DatabaseRateLimitPolicyResolver implements RateLimitPolicyResolver {
  constructor(
    @Inject(STYNX_RATE_LIMIT_OPTIONS)
    private readonly options: RateLimitGuardOptions,
    @Optional()
    private readonly database?: Database,
  ) {}

  async resolve(request: RequestLike, metadata: RateLimitMetadata): Promise<ResolvedRateLimitPolicy> {
    const explicitLimit = metadata.limit;
    const explicitWindowSeconds = metadata.windowSeconds;
    const defaultLimit = explicitLimit ?? await this.lookupLimit(request.tenantId, metadata.scope);
    const defaultWindowSeconds = explicitWindowSeconds ?? await this.lookupWindow(request.tenantId, metadata.scope);

    return {
      ...metadata,
      cost: metadata.cost ?? 1,
      limit: defaultLimit,
      windowSeconds: defaultWindowSeconds,
    };
  }

  private async lookupLimit(tenantId: string | undefined, scope: string): Promise<number> {
    const override = await this.lookupOverride(tenantId, scope);
    if (override?.limit_value) {
      return override.limit_value;
    }
    const platform = await this.lookupPlatformConfig(scope);
    return platform?.limit ?? this.options.defaults?.[scope]?.limit ?? this.options.defaultLimit ?? 120;
  }

  private async lookupWindow(tenantId: string | undefined, scope: string): Promise<number> {
    const override = await this.lookupOverride(tenantId, scope);
    if (override?.window_seconds) {
      return override.window_seconds;
    }
    const platform = await this.lookupPlatformConfig(scope);
    return platform?.windowSeconds ?? this.options.defaults?.[scope]?.windowSeconds ?? this.options.defaultWindowSeconds ?? 60;
  }

  private async lookupOverride(tenantId: string | undefined, scope: string): Promise<OverrideRow | null> {
    if (!tenantId || !this.database) {
      return null;
    }
    const database = this.database;
    return database.withSystemContext('rate limit policy override lookup', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<OverrideRow>(
            `
              select limit_value, window_seconds
              from core.rate_limit_overrides
              where tenant_id = $1::uuid
                and scope = $2
              order by updated_at desc
              limit 1
            `,
            [tenantId, scope],
          );
          return result.rows[0] ?? null;
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  private async lookupPlatformConfig(scope: string): Promise<ConfigRow['value'] | null> {
    if (!this.database) {
      return null;
    }
    const database = this.database;
    const keys = [`ratelimit.${scope}`, `ratelimit:${scope}`];
    return database.withSystemContext('rate limit platform config lookup', async () =>
      database.tx(
        async (trx) => {
          for (const key of keys) {
            const result = await trx.query<ConfigRow>(
              `
                select value
                from core.config
                where key = $1
                  and tenant_id is null
                limit 1
              `,
              [key],
            );
            if (result.rows[0]?.value) {
              return result.rows[0].value;
            }
          }
          return null;
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }
}
