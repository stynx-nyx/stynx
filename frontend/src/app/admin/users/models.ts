export interface UserSummary {
  id: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  status: 'active' | 'disabled' | 'pending';
  groups: string[];
}

export interface UserDetail extends UserSummary {
  createdAt?: string;
  updatedAt?: string;
  tenancies: TenancySummary[];
  roles: RoleSummary[];
  attributes: Record<string, unknown>;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

export interface RoleSummary {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface TenancySummary {
  id: string;
  code: string;
  name: string;
}

export interface UserQuery {
  email?: string;
  phone?: string;
  group?: string;
}
