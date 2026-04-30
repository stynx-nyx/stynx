import type {
  IdentityAdminAdapter,
  IdentityGroupMeta,
  IdentityGroupSummary,
  IdentityListGroupsResult,
  IdentityListUsersResult,
  IdentityLocalSyncAdapter,
  IdentityLocalSyncResult,
  IdentitySyncContext,
  IdentityUserDetail,
} from '@stynx/contracts';
import { IdentityAdminError } from '@stynx/contracts';

type QueryResult<T> = { rows: T[]; rowCount?: number } | T[];

export interface IdentityLocalSyncSqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
    client?: unknown,
  ): Promise<QueryResult<T>>;
  withTransaction?<T>(
    run: (client: unknown) => Promise<T>,
    context?: IdentitySyncContext,
  ): Promise<T>;
}

export interface IdentityGroupMetaRow {
  code: string;
  label?: string | null;
  caption?: string | null;
  icon?: string | null;
  meta?: Record<string, unknown> | null;
  sortOrder?: number | null;
}

export interface PgIdentityLocalSyncAdapterOptions {
  identityAdmin: IdentityAdminAdapter;
  db: IdentityLocalSyncSqlExecutor;
  roleCodeFromGroupName?: (groupName: string) => string;
  roleDescriptionFromGroup?: (group: IdentityGroupSummary) => string;
  userIdFromDetail?: (detail: IdentityUserDetail) => string | undefined;
  displayNameFromDetail?: (detail: IdentityUserDetail) => string | undefined;
  resolveUsernameByUserId?: (userId: string, db: IdentityLocalSyncSqlExecutor) => Promise<string | undefined>;
  loadGroupMetaRows?: (db: IdentityLocalSyncSqlExecutor) => Promise<IdentityGroupMetaRow[]>;
}

interface SyncRecord {
  userId: string;
  username: string;
  enabled: boolean;
  status?: string;
  email?: string;
  attributes: Record<string, string>;
  groups: string[];
}

function buildSyncRecord(params: {
  userId: string;
  username: string;
  enabled: boolean;
  status?: string;
  email?: string;
  attributes: Record<string, string>;
  groups: string[];
}): SyncRecord {
  return {
    userId: params.userId,
    username: params.username,
    enabled: params.enabled,
    attributes: params.attributes,
    groups: params.groups,
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(params.email !== undefined ? { email: params.email } : {}),
  };
}

function toRows<T>(result: QueryResult<T>): T[] {
  return Array.isArray(result) ? result : result.rows;
}

function isUuid(value: string | undefined | null): value is string {
  if (!value) return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value,
  );
}

function defaultRoleCodeFromGroupName(groupName: string): string {
  const normalized = groupName.trim().toLowerCase();
  if (normalized.endsWith('s') && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function defaultRoleDescription(group: IdentityGroupSummary): string {
  if (group.description && group.description.trim().length > 0) {
    return group.description.trim();
  }
  return group.name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultUserIdFromDetail(detail: IdentityUserDetail): string | undefined {
  const sub = detail.attributes.sub;
  return isUuid(sub) ? sub : undefined;
}

function defaultDisplayNameFromDetail(detail: IdentityUserDetail): string | undefined {
  const nameCandidates = [
    detail.attributes.name,
    detail.attributes['custom:displayName'],
    detail.attributes.email,
    detail.username,
  ];
  for (const candidate of nameCandidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

async function defaultResolveUsernameByUserId(
  userId: string,
  db: IdentityLocalSyncSqlExecutor,
): Promise<string | undefined> {
  const rows = toRows(
    await db.query<{ external_id?: string | null }>(
      'SELECT external_id FROM auth.users WHERE user_id = $1',
      [userId],
    ),
  );
  const externalId = rows[0]?.external_id;
  if (typeof externalId !== 'string' || externalId.trim().length === 0) {
    return undefined;
  }
  return externalId.trim();
}

/**
 * Generic Postgres local sync adapter used by IdentityAdminService optional localSyncAdapter hook.
 * Mirrors shared pieces of PORM identity sync:
 * - provider users/groups -> local auth.users/auth.roles/auth.user_roles
 * - optional group metadata enrichment for role-selection endpoints
 */
export class PgIdentityLocalSyncAdapter implements IdentityLocalSyncAdapter {
  private readonly roleCodeFromGroupName: (groupName: string) => string;
  private readonly roleDescriptionFromGroup: (group: IdentityGroupSummary) => string;
  private readonly userIdFromDetail: (detail: IdentityUserDetail) => string | undefined;
  private readonly displayNameFromDetail: (detail: IdentityUserDetail) => string | undefined;
  private readonly resolveUsernameByUserId: (
    userId: string,
    db: IdentityLocalSyncSqlExecutor,
  ) => Promise<string | undefined>;

  constructor(private readonly options: PgIdentityLocalSyncAdapterOptions) {
    this.roleCodeFromGroupName = options.roleCodeFromGroupName ?? defaultRoleCodeFromGroupName;
    this.roleDescriptionFromGroup = options.roleDescriptionFromGroup ?? defaultRoleDescription;
    this.userIdFromDetail = options.userIdFromDetail ?? defaultUserIdFromDetail;
    this.displayNameFromDetail = options.displayNameFromDetail ?? defaultDisplayNameFromDetail;
    this.resolveUsernameByUserId = options.resolveUsernameByUserId ?? defaultResolveUsernameByUserId;
  }

  async syncToLocal(context?: IdentitySyncContext): Promise<IdentityLocalSyncResult> {
    const allGroups = await this.listAllGroups();
    const listedUsers = await this.listAllUsers();

    const records: SyncRecord[] = [];
    let skipped = 0;

    for (const listed of listedUsers) {
      const username = listed.username?.trim();
      if (!username) {
        skipped += 1;
        continue;
      }

      const detail = await this.options.identityAdmin.getUser(username);
      const userId = this.userIdFromDetail(detail);
      if (!userId) {
        skipped += 1;
        continue;
      }

      const groupSummaries = await this.options.identityAdmin.listGroupsForUser(username);
      const groupNames = groupSummaries
        .map((group) => group.name.trim())
        .filter((name): name is string => name.length > 0);

      records.push(buildSyncRecord({
        userId,
        username,
        enabled: detail.enabled,
        ...(detail.status !== undefined ? { status: detail.status } : {}),
        ...(detail.attributes.email !== undefined ? { email: detail.attributes.email } : {}),
        attributes: detail.attributes,
        groups: groupNames,
      }));
    }

    const persisted = await this.persistRecords(records, allGroups, context);
    return {
      ...persisted,
      skipped,
    };
  }

  async syncUser(
    username: string,
    context?: IdentitySyncContext,
  ): Promise<IdentityLocalSyncResult & { id?: string }> {
    const detail = await this.options.identityAdmin.getUser(username);
    const userId = this.userIdFromDetail(detail);
    if (!userId) {
      throw new IdentityAdminError(
        'IDENTITY_VALIDATION_ERROR',
        'Identity user is missing a valid UUID subject',
        { username },
      );
    }

    const userGroups = await this.options.identityAdmin.listGroupsForUser(username);
    const normalizedGroups = userGroups
      .map((group) => group.name.trim())
      .filter((name): name is string => name.length > 0);

    const record: SyncRecord = buildSyncRecord({
      userId,
      username: detail.username,
      enabled: detail.enabled,
      ...(detail.status !== undefined ? { status: detail.status } : {}),
      ...(detail.attributes.email !== undefined ? { email: detail.attributes.email } : {}),
      attributes: detail.attributes,
      groups: normalizedGroups,
    });

    const persisted = await this.persistRecords([record], userGroups, context);
    return { ...persisted, id: userId };
  }

  async listGroupsWithMetaByUserId(userId: string): Promise<{ groups: IdentityGroupMeta[] }> {
    const username = await this.resolveUsernameByUserId(userId, this.options.db);
    if (!username) {
      throw new IdentityAdminError('IDENTITY_NOT_FOUND', 'Identity user not found', { userId });
    }

    const [allGroups, userGroups, metaRows] = await Promise.all([
      this.listAllGroups(),
      this.options.identityAdmin.listGroupsForUser(username),
      this.options.loadGroupMetaRows?.(this.options.db) ?? Promise.resolve([] as IdentityGroupMetaRow[]),
    ]);

    const memberSet = new Set(
      userGroups
        .map((group) => group.name.trim().toLowerCase())
        .filter((name): name is string => name.length > 0),
    );
    const metaByCode = new Map(
      metaRows.map((row) => [row.code.trim().toLowerCase(), row] as const),
    );

    const groups: IdentityGroupMeta[] = allGroups.map((group) => {
      const code = this.roleCodeFromGroupName(group.name);
      const meta = metaByCode.get(code.toLowerCase());
      const label = meta?.label ?? null;
      return {
        name: group.name,
        isIn: memberSet.has(group.name.trim().toLowerCase()),
        code: meta?.code ?? code,
        label,
        caption: meta?.caption ?? label,
        icon: meta?.icon ?? null,
        meta: meta?.meta ?? null,
        sortOrder: meta?.sortOrder ?? null,
        ...(group.description !== undefined ? { description: group.description } : {}),
      };
    });

    groups.sort((a, b) => {
      const orderA = a.sortOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.sortOrder ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return { groups };
  }

  private async listAllUsers(): Promise<IdentityListUsersResult['items']> {
    const items: IdentityListUsersResult['items'] = [];
    let token: string | undefined;
    do {
      const result = await this.options.identityAdmin.listUsers(
        token !== undefined ? { limit: 60, token } : { limit: 60 },
      );
      items.push(...result.items);
      token = result.nextToken;
    } while (token);
    return items;
  }

  private async listAllGroups(): Promise<IdentityListGroupsResult['items']> {
    const items: IdentityListGroupsResult['items'] = [];
    let token: string | undefined;
    do {
      const result = await this.options.identityAdmin.listGroups(
        token !== undefined ? { limit: 60, token } : { limit: 60 },
      );
      items.push(...result.items);
      token = result.nextToken;
    } while (token);
    return items;
  }

  private async persistRecords(
    records: SyncRecord[],
    groups: IdentityGroupSummary[],
    context?: IdentitySyncContext,
  ): Promise<IdentityLocalSyncResult> {
    return this.withTransaction(context, async (client) => {
      const roleIdsByGroupName = new Map<string, string>();
      let groupsUpserted = 0;
      for (const group of groups) {
        const groupName = group.name.trim();
        if (!groupName) continue;

        const roleCode = this.roleCodeFromGroupName(groupName);
        const roleDescription = this.roleDescriptionFromGroup(group);
        const roleRows = toRows(
          await this.options.db.query<{ role_id: string }>(
            `INSERT INTO auth.roles (code, description)
             VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE
               SET description = COALESCE(EXCLUDED.description, description)
             RETURNING role_id`,
            [roleCode, roleDescription],
            client,
          ),
        );
        const roleId = roleRows[0]?.role_id;
        if (!roleId) continue;
        roleIdsByGroupName.set(groupName, roleId);
        groupsUpserted += 1;
      }

      let usersUpserted = 0;
      let memberships = 0;
      for (const record of records) {
        const displayName = this.displayNameFromDetail({
          username: record.username,
          enabled: record.enabled,
          attributes: record.attributes,
          groups: record.groups,
          ...(record.status !== undefined ? { status: record.status } : {}),
          ...(record.email !== undefined ? { email: record.email } : {}),
        });

        await this.options.db.query(
          `INSERT INTO auth.users (
             user_id,
             external_id,
             email,
             display_name,
             status,
             meta
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (user_id) DO UPDATE
             SET external_id = EXCLUDED.external_id,
                 email = EXCLUDED.email,
                 display_name = EXCLUDED.display_name,
                 status = COALESCE(EXCLUDED.status, status),
                 meta = EXCLUDED.meta`,
          [
            record.userId,
            record.username,
            record.email ?? null,
            displayName ?? record.userId,
            record.status ?? null,
            JSON.stringify({
              attributes: record.attributes,
              username: record.username,
              enabled: record.enabled,
              syncedAt: new Date().toISOString(),
              groups: record.groups,
            }),
          ],
          client,
        );
        usersUpserted += 1;

        const seenRoleIds = new Set<string>();
        for (const groupName of record.groups) {
          const roleId = roleIdsByGroupName.get(groupName);
          if (!roleId || seenRoleIds.has(roleId)) continue;
          await this.options.db.query(
            `INSERT INTO auth.user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [record.userId, roleId],
            client,
          );
          seenRoleIds.add(roleId);
          memberships += 1;
        }
      }

      return {
        ok: true,
        groups: groupsUpserted,
        users: usersUpserted,
        memberships,
      };
    });
  }

  private async withTransaction<T>(
    context: IdentitySyncContext | undefined,
    run: (client: unknown) => Promise<T>,
  ): Promise<T> {
    if (!this.options.db.withTransaction) {
      return run(undefined);
    }
    return this.options.db.withTransaction((client) => run(client), context);
  }
}

export interface PormRoleMetaLoaderOptions {
  viewName?: string;
  roleDomain?: string;
}

/**
 * PORM-compatible role metadata loader. Optional helper used by
 * PgIdentityLocalSyncAdapter.loadGroupMetaRows.
 */
export async function loadPormRoleMetaRows(
  db: IdentityLocalSyncSqlExecutor,
  options: PormRoleMetaLoaderOptions = {},
): Promise<IdentityGroupMetaRow[]> {
  const viewName = options.viewName ?? 'porm.v_enum';
  const roleDomain = options.roleDomain ?? 'org_role';
  const rows = toRows(
    await db.query<{
      code: string;
      label?: string | null;
      icon?: string | null;
      meta?: Record<string, unknown> | null;
      sort_order?: number | null;
      order?: number | null;
    }>(
      `SELECT code, label, icon, meta, sort_order, "order"
         FROM ${viewName}
        WHERE domain = $1
        ORDER BY "order", code`,
      [roleDomain],
    ),
  );

  return rows.map((row) => ({
    code: row.code,
    label: row.label ?? null,
    caption: row.label ?? null,
    icon: row.icon ?? null,
    meta: row.meta ?? null,
    sortOrder: row.order ?? row.sort_order ?? null,
  }));
}
