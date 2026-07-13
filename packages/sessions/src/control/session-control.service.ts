import { createHash } from 'node:crypto';
import { validate as validateUuid } from 'uuid';
import { SessionControlError } from './errors';
import type {
  SessionAction,
  SessionAuditSink,
  SessionControlCommand,
  SessionGuarantee,
  SessionMutationResult,
  SessionOperationRecord,
  SessionProviderAdapter,
  SessionRegistry,
  SessionView,
  TrustedSessionContext,
} from './types';

const RETRY_SECONDS = [5, 30, 120, 600, 1800, 7200] as const;
const noopAudit: SessionAuditSink = { write: () => undefined };
const terminal = new Set(['revoked', 'unsupported', 'expired', 'retired']);

export class SessionControlService {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly provider: SessionProviderAdapter,
    private readonly audit: SessionAuditSink = noopAudit,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(
    context: TrustedSessionContext,
    query: { scope?: 'tenant' | 'identity'; subjectId?: string } = {},
  ): Promise<SessionView[]> {
    this.authorize(context, query.scope ?? 'tenant', query.subjectId ?? context.subjectId);
    if (
      query.scope === 'identity' ||
      (query.subjectId !== undefined && query.subjectId !== context.actorId)
    )
      await this.audit.write({
        type: 'privileged-list',
        tenantId: context.tenantId,
        actorId: context.actorId,
        at: this.now().toISOString(),
      });
    const rows = await this.registry.list(context, query);
    return rows.map((row) => ({
      sid: row.sid,
      sessionId: row.sid,
      tenantId: row.tenantId,
      state: row.state,
      provider: row.provider,
      capabilities: row.capabilities,
      guarantee: row.guarantee,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
      terminalAt: row.terminalAt,
      current: row.sid === context.currentSessionId,
      ...(row.metadata.deviceLabel ? { deviceLabel: row.metadata.deviceLabel } : {}),
      ...(row.metadata.client ? { client: row.metadata.client } : {}),
      ...(row.metadata.userAgentFamily ? { userAgent: row.metadata.userAgentFamily } : {}),
      ...(row.metadata.country || row.metadata.region
        ? {
            location: {
              ...(row.metadata.country ? { country: row.metadata.country } : {}),
              ...(row.metadata.region ? { region: row.metadata.region } : {}),
            },
          }
        : {}),
    }));
  }

  async execute(
    context: TrustedSessionContext,
    command: SessionControlCommand,
  ): Promise<SessionMutationResult> {
    this.validateCommand(command);
    const scope = command.scope ?? 'tenant';
    this.authorize(context, scope, command.targetSubjectId ?? context.subjectId);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ ...command, scope }))
      .digest('hex');
    const key = `${scope}:${context.actorId}:${command.action}:${command.operationId}`;
    const existing = await this.registry.operation(key);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new SessionControlError('SESSION_IDEMPOTENCY_CONFLICT', 409);
      return existing.result;
    }
    const all = await this.registry.list(context, {
      scope,
      subjectId: command.targetSubjectId ?? context.subjectId,
    });
    const targets = this.targets(all, context.currentSessionId, command);
    if (!targets.length) throw new SessionControlError('SESSION_NOT_FOUND', 404);
    if (
      targets.some((item) => item.sharedAnchor) &&
      !context.authorities.has('sessions:identity-manage')
    )
      throw new SessionControlError('SESSION_FORBIDDEN', 403);
    await this.audit.write({
      type: 'control-request',
      operationId: command.operationId,
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: command.action,
      at: this.now().toISOString(),
    });
    const results = [];
    for (const target of targets) {
      const capability = this.supports(target.capabilities, command.action, scope);
      if (!capability) {
        target.state = 'unsupported';
        target.terminalAt = this.now().toISOString();
        await this.registry.update(target);
        results.push({
          sid: target.sid,
          status: 'unsupported' as const,
          guarantee: this.none(),
          errorCode: 'SESSION_CAPABILITY_UNSUPPORTED',
        });
        continue;
      }
      await this.audit.write({
        type: 'provider-attempt',
        operationId: command.operationId,
        sessionId: target.sid,
        tenantId: context.tenantId,
        actorId: context.actorId,
        action: command.action,
        at: this.now().toISOString(),
      });
      let providerResult;
      try {
        providerResult = await this.provider.revoke({
          operationId: command.operationId,
          action: command.action,
          registration: target,
        });
      } catch {
        providerResult = {
          status: 'pending' as const,
          guarantee: this.none(),
          errorCode: 'SESSION_OPERATION_PENDING',
        };
      }
      target.state =
        providerResult.status === 'pending' ? 'revocation_pending' : providerResult.status;
      target.guarantee = providerResult.guarantee;
      target.terminalAt =
        providerResult.status === 'pending' || providerResult.status === 'failed'
          ? null
          : this.now().toISOString();
      await this.registry.update(target);
      results.push({ sid: target.sid, ...providerResult });
    }
    const status = results.some((item) => item.status === 'pending')
      ? 'pending'
      : results.some((item) => item.status === 'failed')
        ? 'failed'
        : results.some((item) => item.status === 'unsupported')
          ? 'unsupported'
          : 'revoked';
    const guarantee = results[0]?.guarantee ?? this.none();
    const result: SessionMutationResult = {
      operationId: command.operationId,
      action: command.action,
      scope,
      status,
      guarantee,
      effectiveBy: guarantee.effectiveBy,
      results,
    };
    const operation: SessionOperationRecord = {
      key,
      requestHash,
      result,
      attempts: 1,
      nextAttemptAt:
        status === 'pending'
          ? new Date(this.now().getTime() + RETRY_SECONDS[0] * 1000).toISOString()
          : null,
      leaseUntil: null,
    };
    await this.registry.saveOperation(operation);
    await this.audit.write({
      type: status === 'failed' ? 'failure' : status === 'pending' ? 'pending' : 'result',
      operationId: command.operationId,
      tenantId: context.tenantId,
      actorId: context.actorId,
      action: command.action,
      state: status,
      at: this.now().toISOString(),
    });
    return result;
  }

  async getOperation(
    context: TrustedSessionContext,
    operationId: string,
  ): Promise<SessionMutationResult> {
    if (!validateUuid(operationId)) throw new SessionControlError('SESSION_INVALID', 400);
    for (const scope of ['tenant', 'identity'] as const)
      for (const action of [
        'logout-current',
        'revoke-one',
        'revoke-others',
        'revoke-all',
        'revoke-subject',
        'revoke-tenant',
      ] as SessionAction[]) {
        const found = await this.registry.operation(
          `${scope}:${context.actorId}:${action}:${operationId}`,
        );
        if (found) return found.result;
      }
    throw new SessionControlError('SESSION_NOT_FOUND', 404);
  }

  async reconcile(context: TrustedSessionContext, limit = 25): Promise<number> {
    const now = this.now();
    const lease = new Date(now.getTime() + 60_000).toISOString();
    const claimed = await this.registry.claimPending(now.toISOString(), lease, limit);
    for (const operation of claimed) {
      const command = {
        action: operation.result.action,
        operationId: operation.result.operationId,
        scope: operation.result.scope,
      } as SessionControlCommand;
      const registrations = await this.registry.list(context, { scope: operation.result.scope });
      for (const item of operation.result.results.filter((result) => result.status === 'pending')) {
        const registration = registrations.find((candidate) => candidate.sid === item.sid);
        if (!registration) continue;
        try {
          const outcome = await this.provider.revoke({
            operationId: command.operationId,
            action: command.action,
            registration,
          });
          item.status = outcome.status;
          item.guarantee = outcome.guarantee;
          if (outcome.errorCode) item.errorCode = outcome.errorCode;
          else delete item.errorCode;
          registration.state = outcome.status === 'pending' ? 'revocation_pending' : outcome.status;
          registration.guarantee = outcome.guarantee;
          if (terminal.has(registration.state)) registration.terminalAt = this.now().toISOString();
          await this.registry.update(registration);
        } catch {
          /* remains pending */
        }
      }
      operation.attempts++;
      const stillPending = operation.result.results.some((item) => item.status === 'pending');
      if (stillPending && operation.attempts > RETRY_SECONDS.length) {
        operation.result.status = 'failed';
        operation.result.errorCode = 'SESSION_PROVIDER_FAILED';
        operation.nextAttemptAt = null;
      } else if (stillPending)
        operation.nextAttemptAt = new Date(
          this.now().getTime() + RETRY_SECONDS[operation.attempts - 1]! * 1000,
        ).toISOString();
      else {
        operation.result.status = operation.result.results.every(
          (item) => item.status === 'revoked',
        )
          ? 'revoked'
          : 'unsupported';
        operation.nextAttemptAt = null;
      }
      operation.leaseUntil = null;
      await this.registry.saveOperation(operation);
    }
    return claimed.length;
  }

  private targets(
    all: Awaited<ReturnType<SessionRegistry['list']>>,
    current: string,
    command: SessionControlCommand,
  ) {
    if (command.action === 'logout-current') return all.filter((item) => item.sid === current);
    if (command.action === 'revoke-one')
      return all.filter((item) => item.sid === command.targetSessionId);
    if (command.action === 'revoke-others')
      return all.filter((item) => item.sid !== current && item.state === 'active');
    return all.filter((item) => item.state === 'active');
  }
  private supports(
    c: Awaited<ReturnType<SessionProviderAdapter['capabilities']>>,
    action: SessionAction,
    scope: 'tenant' | 'identity',
  ) {
    return (
      c.controlScopes.includes(scope) &&
      (action === 'revoke-one' || action === 'logout-current'
        ? c.revokeOne
        : action === 'revoke-others'
          ? c.revokeOthers
          : c.revokeAll)
    );
  }
  private authorize(context: TrustedSessionContext, scope: 'tenant' | 'identity', subject: string) {
    if (!context.actorId) throw new SessionControlError('SESSION_UNAUTHENTICATED', 401);
    if (scope === 'identity' && !context.authorities.has('sessions:identity-manage'))
      throw new SessionControlError('SESSION_FORBIDDEN', 403);
    if (
      scope === 'tenant' &&
      subject !== context.actorId &&
      !context.authorities.has('sessions:tenant-manage')
    )
      throw new SessionControlError('SESSION_FORBIDDEN', 403);
    if (
      subject === context.actorId &&
      !context.authorities.has('sessions:self') &&
      !context.authorities.has('sessions:tenant-manage')
    )
      throw new SessionControlError('SESSION_FORBIDDEN', 403);
  }
  private validateCommand(command: SessionControlCommand) {
    if (
      !validateUuid(command.operationId) ||
      (command.targetSessionId && !validateUuid(command.targetSessionId))
    )
      throw new SessionControlError('SESSION_INVALID', 400);
    if (command.action === 'revoke-one' && !command.targetSessionId)
      throw new SessionControlError('SESSION_INVALID', 400);
  }
  private none(): SessionGuarantee {
    return {
      kind: 'none',
      effectiveBy: null,
      propagationBoundSeconds: null,
      accessTokenExpiresAt: null,
    };
  }
}
