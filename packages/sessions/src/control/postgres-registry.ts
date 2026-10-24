import { provisionAnchor, listRegistrations, registerSession, findOperation, saveOperation, recordAttempt, claimPendingOperations, purgeTerminalRegistrations, purgeTerminalOperations, eraseSubjectRegistrations, type RegistrationRow, type OperationRow } from './session-registry.repository.js';
import { Injectable } from '@nestjs/common';
import { Database, executeTypedQueryResult, executeTypedQuery } from '@stynx-nyx/data';
import type {
  SessionInventoryQuery,
  SessionOperationRecord,
  SessionRegistration,
  SessionRegistry,
  TrustedSessionContext,
  TrustedProviderAnchorInput,
} from './types.js';


/** Durable tenant-RLS registry for the provider-neutral session-control facade. */
@Injectable()
export class PostgresSessionRegistry implements SessionRegistry {
  constructor(private readonly database: Database) {}

  /** Provisions an opaque anchor from a trusted authentication boundary. */
  async provisionAnchor(input: TrustedProviderAnchorInput): Promise<void> {
    if ((input.keyedFingerprint === undefined) === (input.encryptedHandle === undefined)) {
      throw new Error('Exactly one opaque provider correlation value is required');
    }
    await this.database.tx(async (trx) => {
      await executeTypedQuery(trx, provisionAnchor,
        [
          input.id,
          input.provider,
          input.encryptedHandle ?? null,
          input.keyedFingerprint ?? null,
          input.providerSubjectKey,
          JSON.stringify(input.capabilities),
          input.expiresAt ?? null,
        ],
      );
    });
  }

  async list(context: TrustedSessionContext, query: SessionInventoryQuery) {
    return this.database.tx(
      async (trx) => {
        const result = await executeTypedQuery(trx, listRegistrations,
          [context.tenantId, query.subjectId ?? null],
        );
        return result.map((row) => this.mapRegistration(row));
      },
      { readonly: true },
    );
  }

  async register(input: SessionRegistration) {
    return this.database.tx(async (trx) => {
      const result = await executeTypedQuery(trx, registerSession,
        [
          input.sid,
          input.anchorId,
          input.tenantId,
          input.subjectId,
          input.state,
          input.metadata.providerLabel ?? input.provider,
          input.metadata.deviceLabel ?? null,
          input.metadata.client ?? null,
          input.metadata.userAgentFamily ?? null,
          input.metadata.deviceClass ?? null,
          input.metadata.country ?? null,
          input.metadata.region ?? null,
          input.guarantee.kind,
          input.guarantee.propagationBoundSeconds,
          input.guarantee.effectiveBy,
          input.guarantee.accessTokenExpiresAt,
          input.sharedAnchor ? 'identity' : 'tenant',
          input.createdAt,
          input.lastSeenAt,
          input.expiresAt,
          input.terminalAt,
          input.provider,
          JSON.stringify(input.capabilities),
        ],
      );
      return this.mapRegistration(result);
    });
  }

  update(input: SessionRegistration) {
    return this.register(input);
  }

  async operation(key: string) {
    const parsed = this.parseKey(key);
    if (!parsed) return null;
    return this.database.tx(
      async (trx) => {
        const result = await executeTypedQuery(trx, findOperation,
          [parsed.operationId, parsed.scope, parsed.actorId, parsed.action],
        );
        return result ? this.mapOperation(key, result) : null;
      },
      { readonly: true },
    );
  }

  async saveOperation(input: SessionOperationRecord) {
    const parsed = this.parseKey(input.key);
    if (!parsed) throw new Error('Invalid internal session operation key');
    await this.database.tx(async (trx) => {
      await executeTypedQuery(trx, saveOperation,
        [
          parsed.operationId,
          parsed.scope,
          parsed.actorId,
          parsed.action,
          input.requestHash,
          input.result.status,
          input.result.guarantee.kind,
          input.attempts,
          input.nextAttemptAt,
          input.leaseUntil,
          input.result.status === 'pending' ? null : new Date().toISOString(),
          input.result.status === 'pending' ? null : new Date().toISOString(),
          JSON.stringify(input.result),
        ],
      );
      await executeTypedQuery(trx, recordAttempt,
        [parsed.operationId, input.attempts, input.result.status, input.result.errorCode ?? null],
      );
    });
  }

  async claimPending(now: string, leaseUntil: string, limit: number) {
    return this.database.tx(async (trx) => {
      const result = await executeTypedQuery(trx, claimPendingOperations,
        [now, leaseUntil, limit],
      );
      return result.map((row) =>
        this.mapOperation(`${row.scope}:${row.actor_id}:${row.action}:${row.operation_id}`, row),
      );
    });
  }

  async purgeTerminal(before: string) {
    return this.database.tx(async (trx) => {
      const result = await executeTypedQueryResult(trx, purgeTerminalRegistrations,
        [before],
      );
      await executeTypedQuery(trx, purgeTerminalOperations, [before]);
      return result.rowCount ?? 0;
    });
  }

  async eraseSubject(tenantId: string, subjectId: string) {
    return this.database.tx(async (trx) => {
      const result = await executeTypedQueryResult(trx, eraseSubjectRegistrations,
        [tenantId, subjectId],
      );
      return result.rowCount ?? 0;
    });
  }

  private mapRegistration(row: RegistrationRow): SessionRegistration {
    return {
      sid: row.sid,
      anchorId: row.anchor_id,
      tenantId: row.tenant_id,
      subjectId: row.subject_id,
      state: row.state,
      provider: row.provider,
      capabilities: row.capabilities,
      guarantee: {
        kind: row.guarantee,
        effectiveBy: this.date(row.effective_by),
        propagationBoundSeconds: row.propagation_bound_seconds,
        accessTokenExpiresAt: this.date(row.access_token_expires_at),
      },
      metadata: {
        ...(row.provider_label ? { providerLabel: row.provider_label } : {}),
        ...(row.device_label ? { deviceLabel: row.device_label } : {}),
        ...(row.client_label ? { client: row.client_label } : {}),
        ...(row.user_agent_family ? { userAgentFamily: row.user_agent_family } : {}),
        ...(row.device_class ? { deviceClass: row.device_class } : {}),
        ...(row.country ? { country: row.country } : {}),
        ...(row.region ? { region: row.region } : {}),
      },
      createdAt: this.date(row.created_at)!,
      lastSeenAt: this.date(row.last_seen_at),
      expiresAt: this.date(row.expires_at),
      terminalAt: this.date(row.terminal_at),
      sharedAnchor: row.blast_radius === 'identity',
    };
  }
  private mapOperation(key: string, row: OperationRow): SessionOperationRecord {
    return {
      key,
      requestHash: row.request_hash,
      result: row.result_json,
      attempts: Number(row.attempt_count),
      nextAttemptAt: this.date(row.next_attempt_at),
      leaseUntil: this.date(row.lease_until),
    };
  }
  private parseKey(key: string) {
    const [scope, actorId, action, operationId] = key.split(':');
    return scope && actorId && action && operationId
      ? { scope, actorId, action, operationId }
      : null;
  }
  private date(value: string | Date | number | null) {
    return value === null ? null : new Date(value).toISOString();
  }
}
