import { randomUUID } from 'node:crypto';
import { BadRequestException, Controller, Get, Headers, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Public, Permission, ReadOnly, StynxAuthGuard, PermissionGuard, StynxJwtValidator } from '@stynx-nyx/auth';
import { RequestContextMutator } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { Idempotent } from '@stynx-nyx/idempotency';
import { RateLimit, STYNX_RATE_LIMIT_STORE, type RateLimitStore } from '@stynx-nyx/ratelimit';
import { Audit } from '@stynx-nyx/backend';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

function hotPathSampleMs(samplesMs: number[]): number {
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const trimmed = sorted.slice(1, -1);
  const hotPathSample = trimmed[0] ?? sorted[0] ?? 0;
  return Number(hotPathSample.toFixed(3));
}

@Controller('/_probes')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class ReferenceProbesController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly database: Database,
    private readonly requestContextMutator: RequestContextMutator,
    private readonly stynxJwtValidator: StynxJwtValidator,
  ) {}

  @Public()
  @Get('/data-tx')
  async dataTx(
    @Res({ passthrough: true }) response: ResponseLike,
    @Headers('authorization') rawAuthorization?: string | string[],
  ) {
    const authorization = typeof rawAuthorization === 'string'
      ? rawAuthorization
      : Array.isArray(rawAuthorization) && typeof rawAuthorization[0] === 'string'
        ? rawAuthorization[0]
        : undefined;
    if (!authorization?.startsWith('Bearer ')) {
      throw new BadRequestException('Missing STYNX bearer token');
    }

    const claims = await this.stynxJwtValidator.validate(authorization.slice('Bearer '.length).trim());
    await this.requestContextMutator.runWithRequestContext(
      {
        requestId: randomUUID(),
        tenantId: claims.tenantId,
        actorId: claims.sub,
        ...(claims.sid ? { sessionId: claims.sid } : {}),
        startedAt: new Date(),
      },
      async () => {
        const samplesMs: number[] = [];
        await this.database.tx(async () => {
          await this.database.tx(async () => undefined, { role: 'reader', readonly: true });
          await this.database.tx(async () => undefined, { role: 'reader', readonly: true });
          for (let index = 0; index < 9; index += 1) {
            const startedAt = performance.now();
            await this.database.tx(async () => undefined, { role: 'reader', readonly: true });
            samplesMs.push(performance.now() - startedAt);
          }
        }, { role: 'reader', readonly: true });
        const overheadMs = hotPathSampleMs(samplesMs);
        response.setHeader('X-Stynx-Data-Tx-Overhead-Ms', overheadMs.toFixed(3));
        return {
          overheadMs,
          samplesMs,
        };
      },
    );
    return { status: 'ok', dataTxOverheadStatistic: 'trimmed_min' };
  }

  @Public()
  @Get('/ratelimit')
  async rateLimit(
    @Res({ passthrough: true }) response: ResponseLike,
    @Query('warm') warm?: string,
  ) {
    const context = {
      request: {
        headers: {},
        ip: '127.0.0.1',
        method: 'GET',
        path: '/_probes/ratelimit',
      },
      bucketKey: 'sample.probes.ratelimit:127.0.0.1',
      ttlMs: 60_000,
      scope: 'sample.probes.ratelimit',
      cost: 1,
      limit: 1000,
      bucket: 'ip' as const,
    };

    const warmRequested = warm === '1' || warm === 'true';
    if (warmRequested) {
      for (let index = 0; index < 9; index += 1) {
        await this.rateLimitStore.consume(context);
      }
    }

    const samplesMs: number[] = [];
    for (let index = 0; index < 9; index += 1) {
      const startedAt = performance.now();
      await this.rateLimitStore.consume(context);
      samplesMs.push(performance.now() - startedAt);
    }
    const overheadMs = hotPathSampleMs(samplesMs);
    response.setHeader('X-Stynx-RateLimit-Overhead-Ms', overheadMs.toFixed(3));
    return {
      status: 'ok',
      rateLimitOverheadMs: overheadMs,
      rateLimitOverheadStatistic: 'trimmed_min',
      rateLimitOverheadSamplesMs: samplesMs.map((sample) => Number(sample.toFixed(3))),
    };
  }

  @Public()
  @Idempotent()
  @Post('/idempotency')
  idempotency() {
    return { status: 'ok' };
  }

  @Get('/readonly-write')
  @ReadOnly()
  @Permission('sample:probe:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.probes.readonly' })
  @Audit({ action: 'sample.probe.readonly-write', entity: 'sample.probe' })
  async readonlyWrite() {
    await this.database.tx(
      async (trx) => {
        await trx.query(
          `
            insert into tenancy.tenant_settings (tenant_id, updated_at)
            values ($1::uuid, clock_timestamp())
            on conflict (tenant_id)
            do update set updated_at = clock_timestamp()
          `,
          ['00000000-0000-0000-0000-000000000000'],
        );
      },
      { role: 'reader', readonly: true },
    );
    return { status: 'unexpected' };
  }

  private get rateLimitStore(): RateLimitStore {
    const store = this.moduleRef.get<RateLimitStore>(STYNX_RATE_LIMIT_STORE, { strict: false });
    if (!store) {
      throw new Error('Rate limit store is unavailable to ReferenceProbesController');
    }
    return store;
  }
}
