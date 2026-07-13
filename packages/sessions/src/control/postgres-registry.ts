import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import type {
  SessionControlCapabilities,
  SessionGuarantee,
  SessionInventoryQuery,
  SessionMutationResult,
  SessionOperationRecord,
  SessionRegistration,
  SessionRegistry,
  TrustedSessionContext,
  TrustedProviderAnchorInput,
} from './types';

interface RegistrationRow {
  sid: string;
  anchor_id: string;
  tenant_id: string;
  subject_id: string;
  state: SessionRegistration['state'];
  provider: string;
  capabilities: SessionControlCapabilities;
  provider_label: string;
  device_label: string | null;
  client_label: string | null;
  user_agent_family: string | null;
  device_class: string | null;
  country: string | null;
  region: string | null;
  guarantee: SessionGuarantee['kind'];
  effective_by: string | Date | null;
  propagation_bound_seconds: number | null;
  access_token_expires_at: string | Date | null;
  blast_radius: 'tenant' | 'identity';
  created_at: string | Date;
  last_seen_at: string | Date | null;
  expires_at: string | Date | null;
  terminal_at: string | Date | null;
}
interface OperationRow {
  operation_id: string;
  scope: SessionMutationResult['scope'];
  actor_id: string;
  action: SessionMutationResult['action'];
  request_hash: string;
  result_json: SessionMutationResult;
  attempt_count: number;
  next_attempt_at: string | Date | null;
  lease_until: string | Date | null;
}

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
      await trx.query(
        `insert into auth.session_provider_anchors
           (id,provider,encrypted_handle,keyed_fingerprint,provider_subject_key,state,capabilities,expires_at)
         values ($1::uuid,$2,$3,$4,$5,'active',$6::jsonb,$7)
         on conflict (id) do update set state='active', capabilities=excluded.capabilities,
           last_seen_at=clock_timestamp(), expires_at=excluded.expires_at`,
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
        const result = await trx.query<RegistrationRow>(
          `select r.*, a.provider, a.capabilities
             from auth.session_registrations r
             join auth.session_provider_anchors a on a.id = r.anchor_id
            where r.tenant_id = $1::uuid
              and ($2::text is null or r.subject_id = $2)
            order by r.last_seen_at desc nulls last, r.created_at desc`,
          [context.tenantId, query.subjectId ?? null],
        );
        return result.rows.map((row) => this.mapRegistration(row));
      },
      { readonly: true },
    );
  }

  async register(input: SessionRegistration) {
    return this.database.tx(async (trx) => {
      const result = await trx.query<RegistrationRow>(
        `insert into auth.session_registrations
           (sid, anchor_id, tenant_id, subject_id, state, provider_label, device_label,
            client_label, user_agent_family, device_class, country, region, guarantee,
            propagation_bound_seconds, effective_by, access_token_expires_at, blast_radius,
            created_at, last_seen_at, expires_at, terminal_at)
         values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         on conflict (sid) do update set
           state=excluded.state, provider_label=excluded.provider_label,
           device_label=excluded.device_label, client_label=excluded.client_label,
           user_agent_family=excluded.user_agent_family, device_class=excluded.device_class,
           country=excluded.country, region=excluded.region, guarantee=excluded.guarantee,
           propagation_bound_seconds=excluded.propagation_bound_seconds,
           effective_by=excluded.effective_by, access_token_expires_at=excluded.access_token_expires_at,
           blast_radius=excluded.blast_radius, last_seen_at=excluded.last_seen_at,
           expires_at=excluded.expires_at, terminal_at=excluded.terminal_at
         returning *, $22::text as provider, $23::jsonb as capabilities`,
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
      return this.mapRegistration(result.rows[0]!);
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
        const result = await trx.query<OperationRow>(
          `select operation_id, scope, actor_id, action, request_hash, result_json,
                attempt_count, next_attempt_at, lease_until
           from auth.session_operations
          where operation_id=$1::uuid and scope=$2 and actor_id=$3 and action=$4`,
          [parsed.operationId, parsed.scope, parsed.actorId, parsed.action],
        );
        return result.rows[0] ? this.mapOperation(key, result.rows[0]) : null;
      },
      { readonly: true },
    );
  }

  async saveOperation(input: SessionOperationRecord) {
    const parsed = this.parseKey(input.key);
    if (!parsed) throw new Error('Invalid internal session operation key');
    await this.database.tx(async (trx) => {
      await trx.query(
        `insert into auth.session_operations
           (operation_id, scope, tenant_id, actor_id, subject_id, action, request_hash,
            state, guarantee, attempt_count, next_attempt_at, lease_until, completed_at,
            terminal_at, result_json)
         values ($1::uuid,$2,current_setting('app.tenant_id')::uuid,$3,null,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         on conflict (tenant_id, operation_id) do update set
           state=excluded.state, guarantee=excluded.guarantee,
           attempt_count=excluded.attempt_count, next_attempt_at=excluded.next_attempt_at,
           lease_until=excluded.lease_until, completed_at=excluded.completed_at,
           terminal_at=excluded.terminal_at, result_json=excluded.result_json`,
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
    });
  }

  async claimPending(now: string, leaseUntil: string, limit: number) {
    return this.database.tx(async (trx) => {
      const result = await trx.query<OperationRow>(
        `with claimed as (
           select tenant_id, operation_id from auth.session_operations
            where state='pending' and (next_attempt_at is null or next_attempt_at <= $1)
              and (lease_until is null or lease_until <= $1)
            order by next_attempt_at nulls first for update skip locked limit $3
         )
         update auth.session_operations o set lease_until=$2
          from claimed c where o.tenant_id=c.tenant_id and o.operation_id=c.operation_id
         returning o.operation_id,o.scope,o.actor_id,o.action,o.request_hash,o.result_json,
                   o.attempt_count,o.next_attempt_at,o.lease_until`,
        [now, leaseUntil, limit],
      );
      return result.rows.map((row) =>
        this.mapOperation(`${row.scope}:${row.actor_id}:${row.action}:${row.operation_id}`, row),
      );
    });
  }

  async purgeTerminal(before: string) {
    return this.database.tx(async (trx) => {
      const result = await trx.query(
        `delete from auth.session_registrations where terminal_at < $1 returning sid`,
        [before],
      );
      await trx.query(`delete from auth.session_operations where terminal_at < $1`, [before]);
      return result.rowCount ?? 0;
    });
  }

  async eraseSubject(tenantId: string, subjectId: string) {
    return this.database.tx(async (trx) => {
      const result = await trx.query(
        `delete from auth.session_registrations where tenant_id=$1::uuid and subject_id=$2 returning sid`,
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
  private date(value: string | Date | null) {
    return value === null ? null : new Date(value).toISOString();
  }
}
