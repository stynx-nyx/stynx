import type {
  SessionOperationRecord,
  SessionRegistration,
  SessionRegistry,
  TrustedSessionContext,
  SessionInventoryQuery,
} from './types';
export class InMemorySessionRegistry implements SessionRegistry {
  private readonly registrations = new Map<string, SessionRegistration>();
  private readonly operations = new Map<string, SessionOperationRecord>();
  async list(
    context: TrustedSessionContext,
    query: SessionInventoryQuery,
  ): Promise<SessionRegistration[]> {
    return [...this.registrations.values()].filter(
      (item) =>
        (query.scope === 'identity' || item.tenantId === context.tenantId) &&
        (!query.subjectId || item.subjectId === query.subjectId),
    );
  }
  async register(input: SessionRegistration) {
    this.registrations.set(input.sid, structuredClone(input));
    return structuredClone(input);
  }
  async update(input: SessionRegistration) {
    return this.register(input);
  }
  async operation(key: string) {
    const value = this.operations.get(key);
    return value ? structuredClone(value) : null;
  }
  async saveOperation(input: SessionOperationRecord) {
    this.operations.set(input.key, structuredClone(input));
  }
  async claimPending(now: string, leaseUntil: string, limit: number) {
    const found = [...this.operations.values()]
      .filter(
        (item) =>
          item.result.status === 'pending' &&
          (!item.nextAttemptAt || item.nextAttemptAt <= now) &&
          (!item.leaseUntil || item.leaseUntil <= now),
      )
      .slice(0, limit);
    for (const item of found) {
      item.leaseUntil = leaseUntil;
      this.operations.set(item.key, item);
    }
    return structuredClone(found);
  }
  async purgeTerminal(before: string) {
    let count = 0;
    for (const [sid, item] of this.registrations)
      if (item.terminalAt && item.terminalAt < before) {
        this.registrations.delete(sid);
        count++;
      }
    return count;
  }
  async eraseSubject(tenantId: string, subjectId: string) {
    let count = 0;
    for (const [sid, item] of this.registrations)
      if (item.tenantId === tenantId && item.subjectId === subjectId) {
        this.registrations.delete(sid);
        count++;
      }
    return count;
  }
}
