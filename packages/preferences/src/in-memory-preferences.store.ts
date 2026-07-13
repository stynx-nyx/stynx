import type {
  PreferenceMutation,
  PreferencesStore,
  StoredSubjectPreferences,
  TrustedPreferenceScope,
} from './types';
export class InMemoryPreferencesStore implements PreferencesStore {
  private readonly rows = new Map<string, StoredSubjectPreferences>();
  private key(scope: TrustedPreferenceScope): string {
    return `${scope.tenantId}\0${scope.subjectId}`;
  }
  async read(scope: TrustedPreferenceScope): Promise<StoredSubjectPreferences | null> {
    return structuredClone(this.rows.get(this.key(scope)) ?? null);
  }
  async compareAndSet(input: PreferenceMutation): Promise<StoredSubjectPreferences | 'conflict'> {
    const key = this.key(input.scope);
    const current = this.rows.get(key);
    if ((current?.revision ?? 0) !== input.expectedRevision) return 'conflict';
    const now = new Date().toISOString();
    const next: StoredSubjectPreferences = {
      scope: { ...input.scope },
      displayName: input.displayName,
      avatarDocumentId: input.avatarDocumentId,
      overrides: structuredClone(input.overrides),
      revision: input.expectedRevision + 1,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(key, next);
    return structuredClone(next);
  }
}
