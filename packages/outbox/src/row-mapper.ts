/**
 * Column projection shared by every query that returns full outbox rows.
 * Aliasing to camelCase in SQL means the driver row already matches
 * `OutboxRow` — no separate JS-side mapping step, matching pec's
 * `OUTBOX_COLUMNS` convention.
 */
export function outboxColumns(alias?: string): string {
  const p = alias ? `${alias}.` : '';
  return `
    ${p}id,
    ${p}tenant_id as "tenantId",
    ${p}entity,
    ${p}entity_id as "entityId",
    ${p}payload,
    ${p}metadata,
    ${p}status,
    ${p}attempts,
    ${p}last_error as "lastError",
    ${p}ack_time as "ackTime",
    ${p}next_attempt_at as "nextAttemptAt",
    ${p}idempotency_key as "idempotencyKey",
    ${p}created_at as "createdAt",
    ${p}updated_at as "updatedAt"
  `;
}

/** Normalizes a pg-style `{ rows }` or bare-array result into a row array. */
export function toRows<T>(result: { rows: T[] } | T[]): T[] {
  return Array.isArray(result) ? result : result.rows;
}

/** Validates a `schema.table` identifier used to interpolate a table name into SQL text. */
export function assertQualifiedIdentifier(value: string, name: string): string {
  const parts = value.split('.');
  const valid = parts.length > 0 && parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part));
  if (!valid) {
    throw new Error(`Invalid SQL identifier for ${name}: ${value}`);
  }
  return value;
}

export function isPgError(error: unknown): error is { code?: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function isUniqueViolation(error: unknown): boolean {
  return isPgError(error) && error.code === '23505';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
