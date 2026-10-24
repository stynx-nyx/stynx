import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, STYNX_DATABASE } from '@stynx-nyx/data';
import type {
  PreferenceMutation,
  PreferencesStore,
  StoredSubjectPreferences,
  TrustedPreferenceScope,
} from './types.js';
import { insertPreferences, readPreferences, updatePreferences, type PreferencesRow } from './preferences.repository.js';
@Injectable()
export class PostgresPreferencesStore implements PreferencesStore {
  constructor(private readonly moduleRef: ModuleRef) {}
  async read(scope: TrustedPreferenceScope): Promise<StoredSubjectPreferences | null> {
    return this.database.withRequestContext(
      { tenantId: scope.tenantId, actorId: scope.subjectId },
      () => this.database.tx(
      async (trx) => {
        const result = await trx.run(
          readPreferences,
          [scope.tenantId, scope.subjectId],
        );
        return result[0] ? this.map(result[0]) : null;
      },
        { readonly: true },
      ),
    );
  }
  async compareAndSet(input: PreferenceMutation): Promise<StoredSubjectPreferences | 'conflict'> {
    return this.database.withRequestContext(
      { tenantId: input.scope.tenantId, actorId: input.scope.subjectId },
      () => this.database.tx(async (trx) => {
      const result =
        input.expectedRevision === 0
          ? await trx.run(
              insertPreferences,
              [
                input.scope.tenantId,
                input.scope.subjectId,
                input.displayName,
                input.avatarDocumentId,
                JSON.stringify(input.overrides),
              ],
            )
          : await trx.run(
              updatePreferences,
              [
                input.scope.tenantId,
                input.scope.subjectId,
                input.displayName,
                input.avatarDocumentId,
                JSON.stringify(input.overrides),
                input.expectedRevision,
              ],
            );
      return result[0] ? this.map(result[0]) : 'conflict';
      }),
    );
  }
  private map(row: PreferencesRow): StoredSubjectPreferences {
    return {
      scope: { tenantId: row.tenant_id, subjectId: row.subject_id },
      displayName: row.display_name,
      avatarDocumentId: row.avatar_document_id,
      overrides: row.preference_overrides,
      revision: Number(row.revision),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
  private get database(): Database {
    return this.moduleRef.get<Database>(STYNX_DATABASE, { strict: false });
  }
}
