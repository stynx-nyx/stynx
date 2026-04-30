export interface IdentityUserSummary {
  username: string;
  enabled: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  email?: string;
  phoneNumber?: string;
}

export interface IdentityUserDetail extends IdentityUserSummary {
  attributes: Record<string, string>;
  groups?: string[];
}

export interface IdentityGroupSummary {
  name: string;
  description?: string;
}

export interface IdentityListUsersQuery {
  email?: string;
  phone?: string;
  group?: string;
  limit?: number;
  token?: string;
}

export interface IdentityListUsersResult {
  items: IdentityUserSummary[];
  nextToken?: string;
}

export interface IdentityListGroupsResult {
  items: IdentityGroupSummary[];
  nextToken?: string;
}

export interface IdentityUpdateUserRequest {
  email?: string;
  phoneNumber?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  custom?: Record<string, string>;
}

export interface IdentityVerifyChannelsRequest {
  email?: boolean;
  phone?: boolean;
}

export interface IdentitySyncContext {
  actorId?: string;
  roles?: string[];
}

export interface IdentityLocalSyncResult {
  ok: boolean;
  groups: number;
  users: number;
  memberships: number;
  orgs?: number;
  affiliations?: number;
  skipped?: number;
}

export interface IdentityGroupMeta {
  name: string;
  description?: string;
  isIn: boolean;
  code: string;
  label?: string | null;
  caption?: string | null;
  icon?: string | null;
  meta?: Record<string, unknown> | null;
  sortOrder?: number | null;
}

export interface IdentityLocalSyncAdapter {
  syncToLocal(context?: IdentitySyncContext): Promise<IdentityLocalSyncResult>;
  syncUser(
    username: string,
    context?: IdentitySyncContext,
  ): Promise<IdentityLocalSyncResult & { id?: string }>;
  listGroupsWithMetaByUserId(userId: string): Promise<{ groups: IdentityGroupMeta[] }>;
}

export interface IdentityAdminAdapter {
  listUsers(query: IdentityListUsersQuery): Promise<IdentityListUsersResult>;
  getUser(username: string): Promise<IdentityUserDetail>;
  getUserBySubject?(subject: string): Promise<IdentityUserDetail>;
  updateUser(username: string, request: IdentityUpdateUserRequest): Promise<IdentityUserDetail>;
  disableUser(username: string): Promise<void>;
  enableUser(username: string): Promise<void>;
  listGroupsForUser(username: string): Promise<IdentityGroupSummary[]>;
  listGroups(query?: { limit?: number; token?: string }): Promise<IdentityListGroupsResult>;
  addUserToGroup(username: string, groupName: string): Promise<void>;
  removeUserFromGroup(username: string, groupName: string): Promise<void>;
  resetUserPassword(username: string): Promise<void>;
  setUserPassword?(username: string, newPassword: string, permanent?: boolean): Promise<void>;
  verifyUserChannels?(username: string, request: IdentityVerifyChannelsRequest): Promise<void>;
}
