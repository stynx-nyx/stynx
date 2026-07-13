import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, STYNX_DATABASE } from '@stynx-nyx/data';
import type {
  PreferenceMutation,
  PreferenceOverrides,
  PreferencesStore,
  StoredSubjectPreferences,
  TrustedPreferenceScope,
} from './types';
interface Row {
  tenant_id: string;
  subject_id: string;
  display_name: string | null;
  avatar_document_id: string | null;
  preference_overrides: PreferenceOverrides;
  revision: string | number;
  created_at: string | Date;
  updated_at: string | Date;
}
@Injectable()
export class PostgresPreferencesStore implements PreferencesStore {
  constructor(private readonly moduleRef: ModuleRef) {}
  async read(scope: TrustedPreferenceScope): Promise<StoredSubjectPreferences | null> {
    return this.database.withRequestContext(
      { tenantId: scope.tenantId, actorId: scope.subjectId },
      () => this.database.tx(
      async (trx) => {
        const result = await trx.query<Row>(
          'select tenant_id, subject_id, display_name, avatar_document_id, preference_overrides, revision, created_at, updated_at from profile.subject_preferences where tenant_id = $1::uuid and subject_id = $2',
          [scope.tenantId, scope.subjectId],
        );
        return result.rows[0] ? this.map(result.rows[0]) : null;
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
          ? await trx.query<Row>(
              `insert into profile.subject_preferences (tenant_id, subject_id, display_name, avatar_document_id, preference_overrides, revision) values ($1::uuid,$2,$3,$4,$5::jsonb,1) on conflict (tenant_id,subject_id) do nothing returning *`,
              [
                input.scope.tenantId,
                input.scope.subjectId,
                input.displayName,
                input.avatarDocumentId,
                JSON.stringify(input.overrides),
              ],
            )
          : await trx.query<Row>(
              `update profile.subject_preferences set display_name=$3, avatar_document_id=$4, preference_overrides=$5::jsonb, revision=revision+1, updated_at=clock_timestamp() where tenant_id=$1::uuid and subject_id=$2 and revision=$6 returning *`,
              [
                input.scope.tenantId,
                input.scope.subjectId,
                input.displayName,
                input.avatarDocumentId,
                JSON.stringify(input.overrides),
                input.expectedRevision,
              ],
            );
      return result.rows[0] ? this.map(result.rows[0]) : 'conflict';
      }),
    );
  }
  private map(row: Row): StoredSubjectPreferences {
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
