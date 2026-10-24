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
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  AuditChainIsolationError,
  AuditChainKeyMismatchError,
  IndependentTransactionConnectionError,
  ActorContextMissingError,
  ReadOnlyViolationError,
  SerializationFailureError,
  StatementTimeoutError,
  TenantContextMissingError,
  TransactionIdentityMismatchError,
  type TransactionIdentityMismatchReason,
} from './errors.js';
import { resolveAppRoleName } from './app-role.js';
import { StynxPoolRegistry } from './pools.js';
import { createDrizzle, Transaction, type StynxDrizzleDatabase } from './transaction.js';
import {
  STYNX_DATA_METRICS,
  STYNX_DATA_OPTIONS,
  type StynxDataMetricsSink,
  type StynxDataModuleOptions,
} from './tokens.js';
import type { TxOptions } from './types.js';
import { executeTransactionControl, executeTypedQuery } from './checked-executor.js';
import { liveCommandIdentity } from './data-context.repository.js';

interface TransactionContextState {
  client: PoolClient;
  db: StynxDrizzleDatabase;
  savepointCounter: number;
  isolation: NonNullable<TxOptions['isolation']>;
}

interface ConnectionHolder {
  held: boolean;
  strict: boolean;
}
const connectionHolder = new AsyncLocalStorage<ConnectionHolder>();

interface ResolvedExecutionContext {
  requestId?: string;
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
  roles?: readonly string[];
}

const TX_CONTEXT_KEY = Symbol('stynx.data.tx');

function transactionErrorCode(error: unknown): string | undefined {
  try {
    if (!error || typeof error !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    const code: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

function isRetryableError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && ['40001', '40P01'].includes(transactionErrorCode(error) ?? '');
}

function mapTransactionError(error: unknown): unknown {
  const code = transactionErrorCode(error);
  if (code === '40001' && error instanceof Error && error.message === 'audit_chain_requires_read_committed') {
    return new AuditChainIsolationError();
  }
  if (code === 'STY41') return new AuditChainKeyMismatchError();
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
  private readonly resolvedAppRoleName: string;

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
    this.resolvedAppRoleName = resolveAppRoleName(options);
  }

  /** Application SQL role the app pool must present as `current_user` (ADR-OUTBOX-0003 D1). */
  get appRoleName(): string {
    return this.resolvedAppRoleName;
  }

  async tx<T>(fn: (trx: Transaction) => Promise<T>, options: TxOptions = {}): Promise<T> {
    return this.runTransaction(fn, options, false);
  }

  async txIndependent<T>(
    fn: (trx: Transaction) => Promise<T>,
    options: TxOptions = {},
  ): Promise<T> {
    if (
      connectionHolder.getStore()?.held ||
      this.cls.get<TransactionContextState>(TX_CONTEXT_KEY)
    ) {
      throw new IndependentTransactionConnectionError();
    }
    return this.runTransaction(fn, options, true);
  }

  /** Detects a held connection even when a derived request context hides the CLS transaction. */
  hasHeldConnection(): boolean {
    return (
      connectionHolder.getStore()?.held === true ||
      Boolean(this.cls.get<TransactionContextState>(TX_CONTEXT_KEY))
    );
  }

  /** Tenant asserted by the request-context boundary, independent of SQL settings. */
  currentTenantId(): string | undefined {
    return this.requestContext.hasActiveContext()
      ? this.requestContext.snapshot().tenantId
      : undefined;
  }

  private async runTransaction<T>(
    fn: (trx: Transaction) => Promise<T>,
    options: TxOptions,
    independent: boolean,
  ): Promise<T> {
    const resolvedRole = options.role ?? 'app';
    const resolvedReadonly = options.readonly ?? false;
    const retry = options.retry ??
      this.options.retry ?? { attempts: 3, jitterMs: [10, 50] };
    const retryConfig = retry === false ? undefined : retry;
    if (options.requireActor && resolvedRole !== 'app') {
      throw new TransactionIdentityMismatchError(
        { reason: 'requireActor requires app role' },
        'transaction_role',
      );
    }
    this.assertRoleConstraints(resolvedRole, resolvedReadonly, options.replica ?? false);
    const executionContext = this.resolveExecutionContext(resolvedRole);
    if (options.requireActor && !executionContext.actorId?.trim()) {
      throw new ActorContextMissingError();
    }

    const active = this.cls.get<TransactionContextState>(TX_CONTEXT_KEY);
    if (active) {
      if (independent || connectionHolder.getStore()?.strict || options.strictItemMode) {
        throw new IndependentTransactionConnectionError();
      }
      if (options.isolation && options.isolation !== active.isolation) {
        throw new TransactionIdentityMismatchError(
          { reason: 'nested transaction isolation mismatch' },
          'isolation',
        );
      }
      if (options.requireActor) {
        await this.assertLiveCommandIdentity(active.client, executionContext);
      }
      return this.runNestedTransaction(active, resolvedRole, fn);
    }

    if (connectionHolder.getStore()?.held && (independent || connectionHolder.getStore()?.strict)) {
      throw new IndependentTransactionConnectionError();
    }

    const pool = this.pools.get(resolvedRole, options.replica ?? false);
    if (resolvedRole === 'app' && !(options.replica ?? false)) {
      await this.pools.ensureAppRole();
    }
    const attempts = retryConfig === undefined ? 1 : Math.max(retryConfig.attempts, 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (pool === undefined) throw new TypeError('Selected database pool is not initialized');
      const client = await pool.connect();
      let holder: ConnectionHolder | undefined;
      let trx: Transaction | undefined;
      try {
        await executeTransactionControl(client, { kind: 'begin' });
        if (options.isolation) {
          await executeTransactionControl(client, { kind: 'isolation', isolation: options.isolation });
        }
        await this.applySessionState(
          client,
          resolvedRole,
          resolvedReadonly,
          executionContext,
          options.deadlineMs,
          options.lockTimeoutMs,
        );
        if (options.requireActor) {
          await this.assertLiveCommandIdentity(client, executionContext);
        }
        const db = createDrizzle(client);
        const txState: TransactionContextState = {
          client,
          db,
          savepointCounter: 0,
          isolation: options.isolation ?? 'read committed',
        };
        this.cls.set(TX_CONTEXT_KEY, txState);
        const activeTrx = new Transaction(
          client,
          db,
          resolvedRole,
          this.metrics,
          options.strictItemMode === true,
        );
        trx = activeTrx;
        holder = { held: true, strict: options.strictItemMode === true };
        const result = await connectionHolder.run(holder, () => fn(activeTrx));
        activeTrx.close();
        await executeTransactionControl(client, { kind: 'commit' });
        return result;
      } catch (error) {
        await executeTransactionControl(client, { kind: 'rollback' }).catch(() => undefined);
        const mapped = mapTransactionError(error);
        if (attempt < attempts && isRetryableError(mapped)) {
          const [minJitter, maxJitter] = retryConfig!.jitterMs;
          const jitter =
            minJitter + Math.floor(Math.random() * Math.max(1, maxJitter - minJitter + 1));
          await sleep(jitter);
          lastError = mapped;
          continue;
        }
        if (isRetryableError(mapped)) {
          throw new SerializationFailureError({
            attempts: attempt,
            code: transactionErrorCode(mapped),
            ...(lastError ? { lastError: String(lastError) } : {}),
          });
        }
        throw mapped;
        /* v8 ignore next -- v8 reports a synthetic branch on the finally boundary; cleanup paths are covered. */
      } finally {
        trx?.close();
        if (holder) holder.held = false;
        if (this.cls.get(TX_CONTEXT_KEY) !== undefined) {
          this.cls.set(TX_CONTEXT_KEY, null);
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
    const sequence = ++active.savepointCounter;
    await executeTransactionControl(active.client, { kind: 'savepoint', sequence });
    const trx = new Transaction(active.client, active.db, role, this.metrics);
    try {
      const result = await fn(trx);
      trx.close();
      await executeTransactionControl(active.client, { kind: 'release-savepoint', sequence });
      return result;
    } catch (error) {
      trx.close();
      await executeTransactionControl(active.client, { kind: 'rollback-savepoint', sequence });
      throw mapTransactionError(error);
    }
  }

  private async assertLiveCommandIdentity(
    client: PoolClient,
    expected: ResolvedExecutionContext,
  ): Promise<void> {
    const live = await executeTypedQuery(client, liveCommandIdentity, []);
    const mismatch: TransactionIdentityMismatchReason | undefined =
      !live || live.current_user !== this.resolvedAppRoleName
        ? 'sql_role'
        : live.role !== 'app'
          ? 'app_role'
          : live.tenant_id !== expected.tenantId
            ? 'tenant'
            : live.actor_id !== expected.actorId
              ? 'actor'
              : undefined;
    if (mismatch) {
      throw new TransactionIdentityMismatchError(
        { reason: 'live app identity mismatch' },
        mismatch,
      );
    }
  }

  private assertRoleConstraints(
    role: 'owner' | 'app' | 'reader',
    readonly: boolean,
    replica: boolean,
  ): void {
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
    lockTimeoutMs?: number,
  ): Promise<void> {
    await executeTransactionControl(client, { kind: 'setting', name: 'app.role', value: role });
    for (const [name, value] of [
      ['app.request_id', executionContext.requestId],
      ['app.tenant_id', executionContext.tenantId],
      ['app.actor_id', executionContext.actorId],
    ] as const) {
      if (value) await executeTransactionControl(client, { kind: 'setting', name, value });
    }
    await executeTransactionControl(client, {
      kind: 'setting', name: 'app.roles', value: (executionContext.roles ?? []).join(','),
    });
    if (executionContext.sessionId) {
      await executeTransactionControl(client, { kind: 'setting', name: 'app.session_id', value: executionContext.sessionId });
    }
    if (readonly) await executeTransactionControl(client, { kind: 'readonly' });
    if (deadlineMs !== undefined) {
      await executeTransactionControl(client, { kind: 'setting', name: 'statement_timeout', value: String(deadlineMs) });
    }
    if (lockTimeoutMs !== undefined) {
      await executeTransactionControl(client, { kind: 'setting', name: 'lock_timeout', value: String(lockTimeoutMs) });
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
      ...(currentContext.roles?.length ? { roles: currentContext.roles } : {}),
    };
  }
}
