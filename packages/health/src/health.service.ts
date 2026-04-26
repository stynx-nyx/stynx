import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import {
  STYNX_HEALTH_INDICATORS,
  STYNX_HEALTH_OPTIONS,
  type StynxHealthIndicator,
  type StynxHealthIndicatorResult,
  type StynxHealthModuleOptions,
} from './tokens';

class CallbackIndicator implements StynxHealthIndicator {
  constructor(
    readonly name: string,
    private readonly callback?: () => Promise<void>,
  ) {}

  async check() {
    if (!this.callback) {
      return { status: 'up' as const, details: { skipped: true } };
    }
    try {
      await this.callback();
      return { status: 'up' as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'down' as const, details: { error: message } };
    }
  }
}

export type ReadinessEntry = {
  status: StynxHealthIndicatorResult['status'];
} & Record<string, unknown>;

export interface StynxHealthReadinessResult {
  status: 'ok' | 'error';
  info: Record<string, ReadinessEntry>;
  error: Record<string, Record<string, unknown>>;
  details: Record<string, ReadinessEntry>;
}

@Injectable()
export class StynxHealthService {
  private readonly builtIns: StynxHealthIndicator[];

  constructor(
    @Inject(STYNX_HEALTH_OPTIONS)
    private readonly options: StynxHealthModuleOptions,
    @Inject(STYNX_HEALTH_INDICATORS)
    private readonly indicators: StynxHealthIndicator[],
  ) {
    this.builtIns = [
      new CallbackIndicator('postgres', options.pgCheck),
      new CallbackIndicator('redis', options.redisCheck),
      new CallbackIndicator('jwks', options.jwksCheck),
      new CallbackIndicator('s3', options.s3Check),
      ...indicators,
    ];
  }

  async readiness(): Promise<StynxHealthReadinessResult> {
    const checks = await Promise.all(
      this.builtIns.map(async (indicator) => ({
        name: indicator.name,
        result: await indicator.check(),
      })),
    );

    const details = Object.fromEntries(
      checks.map((entry) => [entry.name, { status: entry.result.status, ...(entry.result.details ?? {}) }]),
    ) as Record<string, ReadinessEntry>;
    const failures = checks.filter((entry) => entry.result.status === 'down');
    const error = Object.fromEntries(
      failures.map((entry) => [entry.name, entry.result.details ?? { status: 'down' }]),
    ) as Record<string, Record<string, unknown>>;

    const result: StynxHealthReadinessResult = {
      status: failures.length > 0 ? 'error' : 'ok',
      info: details,
      error,
      details,
    };

    if (failures.length > 0) {
      throw new HealthCheckError('stynx readiness failed', result);
    }

    return result;
  }
}
