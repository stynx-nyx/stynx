import type { AuditActorSummary, AuditEntitySummary, AuditEventSummary, AuditEventDetail, AuditIntegrityReport, AuditIntegrityTone, AuditPage } from './types';

/** Complete declared-field guards; returned values retain identity and unknown extensions. */
export type Guard<T> = (value: unknown) => value is T;
type Shape<T> = { [K in keyof T]-?: Guard<T[K]> };

export const string: Guard<string> = (value): value is string => typeof value === 'string';
export const number: Guard<number> = (value): value is number => typeof value === 'number';
export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
export const opaque: Guard<unknown> = (_value): _value is unknown => true;
export const record: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const nullValue: Guard<null> = (value): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    // Visit empty slots too; every() skips them and cannot establish T[].
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (!guard(item)) return false;
    }
    return true;
  };
}
export function union<A, B>(left: Guard<A>, right: Guard<B>): Guard<A | B> {
  return (value): value is A | B => left(value) || right(value);
}
export function literals<const T extends string>(...values: readonly T[]): Guard<T> {
  return (value): value is T => values.some((candidate) => candidate === value);
}
export function object<T extends object>(shape: Shape<T>): Guard<T> {
  return (value): value is T => {
    if (!record(value)) return false;
    for (const key in shape) {
      if (!shape[key](value[key])) return false;
    }
    return true;
  };
}
export function decode<T>(guard: Guard<T>, name: string): (value: unknown) => T {
  return (value) => {
    if (!guard(value)) throw new TypeError(`Invalid ${name} response`);
    return value;
  };
}

export function isAuditActorSummary(value: unknown): value is AuditActorSummary {
  return object<AuditActorSummary>({
    id: optional(nullable(string)),
    displayName: optional(nullable(string)),
    role: optional(nullable(string)),
  })(value);
}

export function isAuditEntitySummary(value: unknown): value is AuditEntitySummary {
  return object<AuditEntitySummary>({
    kind: string,
    id: optional(nullable(string)),
    label: optional(nullable(string)),
  })(value);
}

export function isAuditEventSummary(value: unknown): value is AuditEventSummary {
  return object<AuditEventSummary>({
    eventId: string,
    occurredAt: string,
    tenantId: optional(nullable(string)),
    actor: isAuditActorSummary,
    action: string,
    entity: isAuditEntitySummary,
    requestId: optional(nullable(string)),
    integrity: isAuditIntegrityTone,
  })(value);
}

export function isAuditEventDetail(value: unknown): value is AuditEventDetail {
  return object<AuditEventDetail>({
    eventId: string,
    occurredAt: string,
    tenantId: optional(nullable(string)),
    actor: isAuditActorSummary,
    action: string,
    entity: isAuditEntitySummary,
    requestId: optional(nullable(string)),
    integrity: isAuditIntegrityTone,
    sessionId: optional(nullable(string)),
    ipAddress: optional(nullable(string)),
    metadata: record,
    before: optional(nullable(record)),
    after: optional(nullable(record)),
    previousHash: optional(nullable(string)),
    rowHash: optional(nullable(string)),
  })(value);
}

export function isAuditIntegrityReport(value: unknown): value is AuditIntegrityReport {
  return object<AuditIntegrityReport>({
    eventId: string,
    tenantId: optional(nullable(string)),
    valid: boolean,
    checkedAt: string,
    checkedThroughEventId: string,
    previousEventId: optional(nullable(string)),
    nextEventId: optional(nullable(string)),
    previousHash: optional(nullable(string)),
    rowHash: optional(nullable(string)),
    totalChecked: number,
    firstBrokenEventId: optional(string),
  })(value);
}

export const isAuditIntegrityTone: Guard<AuditIntegrityTone> = literals('valid', 'broken', 'unchecked');

export const isAuditPage = object<AuditPage>({ items: array(isAuditEventSummary), nextCursor: optional(string) });
