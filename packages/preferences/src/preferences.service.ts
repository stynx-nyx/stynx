import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { PreferencesError } from './errors';
import {
  PLATFORM_PREFERENCE_DEFAULTS,
  preferencePatchSchema,
  preferenceValuesSchema,
  profilePatchSchema,
} from './schema';
import {
  STYNX_PREFERENCES_AUDIT,
  STYNX_PREFERENCES_AVATAR,
  STYNX_PREFERENCES_OPTIONS,
  STYNX_PREFERENCES_STORE,
} from './tokens';
import type {
  PlatformProfile,
  PreferenceCategory,
  PreferenceOverrides,
  PreferencePatch,
  PreferencesAuditSink,
  PreferencesAvatarResolver,
  PreferencesDocument,
  PreferencesStore,
  PreferenceValues,
  StoredSubjectPreferences,
  StynxPreferencesModuleOptions,
  TrustedPreferenceScope,
} from './types';

const categories: PreferenceCategory[] = [
  'locale',
  'theme',
  'accessibility',
  'notificationDelivery',
];

@Injectable()
export class PreferencesService {
  private readonly defaults: PreferenceValues;
  constructor(
    private readonly context: RequestContext,
    @Inject(STYNX_PREFERENCES_STORE) private readonly store: PreferencesStore,
    @Inject(STYNX_PREFERENCES_OPTIONS) private readonly options: StynxPreferencesModuleOptions,
    @Inject(STYNX_PREFERENCES_AUDIT) private readonly audit: PreferencesAuditSink,
    @Inject(STYNX_PREFERENCES_AVATAR) private readonly avatars: PreferencesAvatarResolver,
  ) {
    const parsed = preferenceValuesSchema.safeParse(
      options.defaults ?? PLATFORM_PREFERENCE_DEFAULTS,
    );
    if (!parsed.success) throw new Error('Invalid STYNX preference defaults');
    this.defaults = parsed.data;
  }
  async getPreferences(): Promise<PreferencesDocument> {
    const row = await this.store.read(this.scope());
    return this.document(row);
  }
  async getProfile(): Promise<PlatformProfile> {
    const scope = this.scope();
    const row = await this.store.read(scope);
    return {
      subjectId: scope.subjectId,
      displayName: row?.displayName ?? null,
      avatarDocumentId: row?.avatarDocumentId ?? null,
      avatarUrl: await this.avatars.resolve(row?.avatarDocumentId ?? null, scope),
      preferences: this.document(row),
      revision: row?.revision ?? 0,
      updatedAt: row?.updatedAt ?? null,
    };
  }
  async putPreferences(raw: unknown, expectedRevision: number): Promise<PreferencesDocument> {
    this.assertSize(raw);
    const parsed = preferenceValuesSchema.safeParse(raw);
    if (!parsed.success)
      throw new PreferencesError(
        'PREFERENCES_INVALID',
        400,
        parsed.error.issues.map((issue) => issue.path.join('.')),
      );
    this.assertSupported(parsed.data);
    const overrides = this.toOverrides(parsed.data);
    return this.mutate(
      overrides,
      expectedRevision,
      'preferences.updated',
      this.changedPaths(overrides),
    );
  }
  async patchPreferences(raw: unknown, expectedRevision: number): Promise<PreferencesDocument> {
    this.assertSize(raw);
    const parsed = preferencePatchSchema.safeParse(raw);
    if (!parsed.success)
      throw new PreferencesError(
        'PREFERENCES_INVALID',
        400,
        parsed.error.issues.map((issue) => issue.path.join('.')),
      );
    const current = await this.store.read(this.scope());
    const overrides = structuredClone(current?.overrides ?? {});
    this.applyPatch(overrides, parsed.data as PreferencePatch);
    const effective = this.resolve(overrides);
    this.assertSupported(effective);
    return this.mutate(
      overrides,
      expectedRevision,
      'preferences.updated',
      this.patchPaths(parsed.data as PreferencePatch),
    );
  }
  async reset(
    category: PreferenceCategory | null,
    expectedRevision: number,
  ): Promise<PreferencesDocument> {
    if (category !== null && !categories.includes(category))
      throw new PreferencesError('PREFERENCES_CATEGORY_NOT_FOUND', 404, ['category']);
    const current = await this.store.read(this.scope());
    const overrides = structuredClone(current?.overrides ?? {});
    if (category) delete overrides[category];
    else for (const key of categories) delete overrides[key];
    return this.mutate(
      overrides,
      expectedRevision,
      category ? 'preferences.category_reset' : 'preferences.reset',
      category ? [category] : categories,
    );
  }
  async patchProfile(raw: unknown, expectedRevision: number): Promise<PlatformProfile> {
    this.assertSize(raw);
    const parsed = profilePatchSchema.safeParse(raw);
    if (!parsed.success) {
      const keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
      const forbidden = keys.some((key) => !['displayName', 'avatarDocumentId'].includes(key));
      throw new PreferencesError(
        forbidden ? 'PREFERENCES_FORBIDDEN_FIELD' : 'PREFERENCES_INVALID',
        400,
        forbidden ? keys : parsed.error.issues.map((issue) => issue.path.join('.')),
      );
    }
    const scope = this.scope();
    const current = await this.store.read(scope);
    const next = await this.store.compareAndSet({
      scope,
      expectedRevision,
      displayName:
        parsed.data.displayName === undefined
          ? (current?.displayName ?? null)
          : parsed.data.displayName,
      avatarDocumentId:
        parsed.data.avatarDocumentId === undefined
          ? (current?.avatarDocumentId ?? null)
          : parsed.data.avatarDocumentId,
      overrides: current?.overrides ?? {},
    });
    if (next === 'conflict') throw new PreferencesError('PREFERENCES_REVISION_CONFLICT', 412);
    await this.emit(
      'profile.updated',
      current?.revision ?? 0,
      next.revision,
      Object.keys(parsed.data),
    );
    return this.getProfile();
  }
  private scope(): TrustedPreferenceScope {
    let tenantId: string | undefined;
    let subjectId: string | undefined;
    try {
      tenantId = this.context.tenantId;
      subjectId = this.context.actorId;
    } catch {
      throw new PreferencesError('PREFERENCES_UNAUTHENTICATED', 401);
    }
    if (!subjectId) throw new PreferencesError('PREFERENCES_UNAUTHENTICATED', 401);
    if (!tenantId) throw new PreferencesError('PREFERENCES_FORBIDDEN', 403);
    if (Buffer.byteLength(subjectId) > 255)
      throw new PreferencesError('PREFERENCES_INVALID', 400, ['subject']);
    return { tenantId, subjectId };
  }
  private document(row: StoredSubjectPreferences | null): PreferencesDocument {
    return {
      values: this.resolve(row?.overrides ?? {}),
      revision: row?.revision ?? 0,
      updatedAt: row?.updatedAt ?? null,
    };
  }
  private resolve(overrides: PreferenceOverrides): PreferenceValues {
    return {
      locale: { ...this.defaults.locale, ...overrides.locale },
      theme: { ...this.defaults.theme, ...overrides.theme },
      accessibility: { ...this.defaults.accessibility, ...overrides.accessibility },
      notificationDelivery: {
        ...this.defaults.notificationDelivery,
        ...overrides.notificationDelivery,
      },
    };
  }
  private toOverrides(values: PreferenceValues): PreferenceOverrides {
    const output: PreferenceOverrides = {};
    for (const category of categories) {
      const diff = Object.fromEntries(
        Object.entries(values[category]).filter(
          ([key, value]) =>
            value !== (this.defaults[category] as unknown as Record<string, unknown>)[key],
        ),
      );
      if (Object.keys(diff).length) (output as Record<string, unknown>)[category] = diff;
    }
    return output;
  }
  private applyPatch(target: PreferenceOverrides, patch: PreferencePatch): void {
    for (const category of categories) {
      const value = patch[category];
      if (value === undefined) continue;
      if (value === null) {
        delete target[category];
        continue;
      }
      const next = { ...((target[category] ?? {}) as Record<string, unknown>) };
      for (const [key, leaf] of Object.entries(value)) {
        if (leaf === null) delete next[key];
        else next[key] = leaf;
      }
      if (Object.keys(next).length) (target as Record<string, unknown>)[category] = next;
      else delete target[category];
    }
  }
  private async mutate(
    overrides: PreferenceOverrides,
    expectedRevision: number,
    operation: 'preferences.updated' | 'preferences.category_reset' | 'preferences.reset',
    paths: string[],
  ): Promise<PreferencesDocument> {
    const scope = this.scope();
    const current = await this.store.read(scope);
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new PreferencesError('PREFERENCES_REVISION_CONFLICT', 412);
    if (JSON.stringify(current?.overrides ?? {}) === JSON.stringify(overrides))
      return this.document(current);
    const next = await this.store.compareAndSet({
      scope,
      expectedRevision,
      displayName: current?.displayName ?? null,
      avatarDocumentId: current?.avatarDocumentId ?? null,
      overrides,
    });
    if (next === 'conflict') throw new PreferencesError('PREFERENCES_REVISION_CONFLICT', 412);
    await this.emit(operation, current?.revision ?? 0, next.revision, paths);
    return this.document(next);
  }
  private async emit(
    operation:
      | 'preferences.updated'
      | 'preferences.category_reset'
      | 'preferences.reset'
      | 'profile.updated',
    previousRevision: number,
    newRevision: number,
    changedPaths: string[],
  ): Promise<void> {
    const scope = this.scope();
    await this.audit.write({
      operation,
      tenantId: scope.tenantId,
      subjectId: scope.subjectId,
      actorId: scope.subjectId,
      requestId: this.context.requestId,
      changedPaths,
      previousRevision,
      newRevision,
      occurredAt: new Date().toISOString(),
    });
  }
  private assertSupported(values: PreferenceValues): void {
    if (
      this.options.supportedLocales &&
      !this.options.supportedLocales.includes(values.locale.locale)
    )
      throw new PreferencesError('PREFERENCES_INVALID', 400, ['locale.locale']);
    if (
      this.options.supportedTimezones &&
      !this.options.supportedTimezones.includes(values.locale.timezone)
    )
      throw new PreferencesError('PREFERENCES_INVALID', 400, ['locale.timezone']);
  }
  private assertSize(raw: unknown): void {
    let serialized: string;
    try {
      serialized = JSON.stringify(raw);
    } catch {
      throw new PreferencesError('PREFERENCES_INVALID', 400);
    }
    if (Buffer.byteLength(serialized) > 16 * 1024)
      throw new PreferencesError('PREFERENCES_TOO_LARGE', 413);
  }
  private changedPaths(overrides: PreferenceOverrides): string[] {
    return categories.flatMap((category) =>
      Object.keys(overrides[category] ?? {}).map((key) => `${category}.${key}`),
    );
  }
  private patchPaths(patch: PreferencePatch): string[] {
    return Object.entries(patch).flatMap(([category, value]) =>
      value === null ? [category] : Object.keys(value ?? {}).map((key) => `${category}.${key}`),
    );
  }
}
