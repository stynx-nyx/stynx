import {
  Database as CoreDatabase,
  RequestContext,
  RequestContextMutator,
  SystemContext,
  SystemContextRequiredError,
  type SystemExecutionContext,
  generateRequestId,
} from '@stynx-nyx/core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { PoolClient } from 'pg';
import {
  ActorContextMissingError,
  ReadOnlyViolationError,
  SerializationFailureError,
  StatementTimeoutError,
  TenantContextMissingError,
} from './errors';
import { StynxPoolRegistry } from './pools';
import { createDrizzle, Transaction, type StynxDrizzleDatabase } from './transaction';
import {
  STYNX_DATA_METRICS,
  STYNX_DATA_OPTIONS,
  type StynxDataMetricsSink,
  type StynxDataModuleOptions,
} from './tokens';
import type { TxOptions } from './types';

interface TransactionContextState {
  client: PoolClient;
  db: StynxDrizzleDatabase;
  savepointCounter: number;
}

interface ResolvedExecutionContext {
  requestId?: string;
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
}

const TX_CONTEXT_KEY = Symbol('stynx.data.tx');

function isRetryableError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && (error as Error & { code?: string }).code !== undefined
    && ['40001', '40P01'].includes((error as Error & { code: string }).code);
}

function mapTransactionError(error: unknown): unknown {
  const code = (error as { code?: string })?.code;
  if (code === '25006') {
    return new ReadOnlyViolationError({ originalCode: code });
  }
  if (code === '57014') {
    return new StatementTimeoutError({ originalCode: code });
  }
  return error;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class Database extends CoreDatabase {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly systemContext: SystemContext,
    private readonly pools: StynxPoolRegistry,
    private readonly cls: ClsService<Record<PropertyKey, unknown>>,
    @Inject(STYNX_DATA_OPTIONS)
    private readonly options: StynxDataModuleOptions,
    @Optional()
    @Inject(STYNX_DATA_METRICS)
    private readonly metrics?: StynxDataMetricsSink,
    private readonly requestContextMutator?: RequestContextMutator,
  ) {
    super();
  }

  async tx<T>(fn: (trx: Transaction) => Promise<T>, options: TxOptions = {}): Promise<T> {
    const resolvedRole = options.role ?? 'app';
    const resolvedReadonly = options.readonly ?? false;
    const retry = options.retry ?? this.options.retry ?? { attempts: 3, jitterMs: [10, 50] as [number, number] };
    const retryConfig = retry === false ? undefined : retry;
    this.assertRoleConstraints(resolvedRole, resolvedReadonly, options.replica ?? false);
    const executionContext = this.resolveExecutionContext(resolvedRole);

    const active = this.cls.get<TransactionContextState>(TX_CONTEXT_KEY);
    if (active) {
      return this.runNestedTransaction(active, resolvedRole, fn);
    }

    const pool = this.pools.get(resolvedRole, options.replica ?? false);
    const attempts = retryConfig === undefined ? 1 : Math.max(retryConfig.attempts, 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await this.applySessionState(
          client,
          resolvedRole,
          resolvedReadonly,
          executionContext,
          options.deadlineMs,
        );
        const db = createDrizzle(client);
        const txState: TransactionContextState = {
          client,
          db,
          savepointCounter: 0,
        };
        this.cls.set(TX_CONTEXT_KEY, txState);
        const trx = new Transaction(client, db, resolvedRole, this.metrics);
        const result = await fn(trx);
        trx.close();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        const mapped = mapTransactionError(error);
        if (attempt < attempts && isRetryableError(mapped)) {
          const [minJitter, maxJitter] = retryConfig!.jitterMs;
          const jitter = minJitter + Math.floor(Math.random() * Math.max(1, maxJitter - minJitter + 1));
          await sleep(jitter);
          lastError = mapped;
          continue;
        }
        if (isRetryableError(mapped)) {
          throw new SerializationFailureError({
            attempts: attempt,
            code: mapped.code,
            ...(lastError ? { lastError: String(lastError) } : {}),
          });
        }
        throw mapped;
      /* v8 ignore next -- v8 reports a synthetic branch on the finally boundary; cleanup paths are covered. */
      } finally {
        if (this.cls.get(TX_CONTEXT_KEY) !== undefined) {
          this.cls.set(TX_CONTEXT_KEY, null as unknown as TransactionContextState);
        }
        client.release();
      }
    }

    throw new SerializationFailureError();
  }

  withReplica<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    return this.tx(fn, { role: 'reader', readonly: true, replica: true });
  }

  withRequestContext<T>(
    scope: { tenantId: string; actorId: string; sessionId?: string },
    fn: () => Promise<T>,
  ): Promise<T> {
    return Promise.resolve(
      this.requestContextMutator!.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: scope.tenantId,
          actorId: scope.actorId,
          ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
          startedAt: new Date(),
        },
        fn,
      ),
    );
  }

  override withSystemContext<T>(
    reason: string,
    fn: (context: SystemExecutionContext) => Promise<T>,
  ): Promise<T> {
    return this.systemContext.withSystemContext(reason, fn);
  }

  private async runNestedTransaction<T>(
    active: TransactionContextState,
    role: 'owner' | 'app' | 'reader',
    fn: (trx: Transaction) => Promise<T>,
  ): Promise<T> {
    const savepointName = `stynx_sp_${active.savepointCounter += 1}`;
    await active.client.query(`SAVEPOINT ${savepointName}`);
    const trx = new Transaction(active.client, active.db, role, this.metrics);
    try {
      const result = await fn(trx);
      trx.close();
      await active.client.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      trx.close();
      await active.client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      throw mapTransactionError(error);
    }
  }

  private assertRoleConstraints(role: 'owner' | 'app' | 'reader', readonly: boolean, replica: boolean): void {
    if (role === 'reader' && !readonly) {
      throw new ReadOnlyViolationError({ role, readonly });
    }
    if (replica && !readonly) {
      throw new ReadOnlyViolationError({ role, readonly, replica });
    }
    if (role === 'owner') {
      try {
        this.systemContext.current();
      } catch {
        throw new SystemContextRequiredError();
      }
    }
  }

  private async applySessionState(
    client: PoolClient,
    role: 'owner' | 'app' | 'reader',
    readonly: boolean,
    executionContext: ResolvedExecutionContext,
    deadlineMs?: number,
  ): Promise<void> {
    await client.query(`SELECT set_config('app.role', $1, true)`, [role]);

    if (executionContext.requestId) {
      await client.query(`SELECT set_config('app.request_id', $1, true)`, [executionContext.requestId]);
    }
    if (executionContext.tenantId) {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [executionContext.tenantId]);
    }
    if (executionContext.actorId) {
      await client.query(`SELECT set_config('app.actor_id', $1, true)`, [
        executionContext.actorId,
      ]);
    }
    if (executionContext.sessionId) {
      await client.query(`SELECT set_config('app.session_id', $1, true)`, [executionContext.sessionId]);
    }

    if (readonly) {
      await client.query('SET LOCAL TRANSACTION READ ONLY');
    }
    if (deadlineMs !== undefined) {
      await client.query(`SELECT set_config('statement_timeout', $1, true)`, [String(deadlineMs)]);
    }
  }

  private resolveExecutionContext(role: 'owner' | 'app' | 'reader'): ResolvedExecutionContext {
    const currentContext = this.requestContext.hasActiveContext()
      ? this.requestContext.snapshot()
      : undefined;

    if (role === 'owner') {
      const systemContext = this.systemContext.current();
      return {
        requestId: systemContext.requestId,
        ...(systemContext.actorId ? { actorId: systemContext.actorId } : {}),
      };
    }

    if (!currentContext?.tenantId) {
      throw new TenantContextMissingError();
    }
    if (!currentContext.actorId) {
      throw new ActorContextMissingError();
    }

    return {
      requestId: currentContext.requestId,
      tenantId: currentContext.tenantId,
      actorId: currentContext.actorId,
      ...(currentContext.sessionId ? { sessionId: currentContext.sessionId } : {}),
    };
  }
}
