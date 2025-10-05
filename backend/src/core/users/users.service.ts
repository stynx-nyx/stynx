import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

export interface UserSummary {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: string | null;
  roles: string[];
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async listByTenancy(tenancyId: string): Promise<UserSummary[]> {
    const result = await this.db.query<UserSummary>(
      `SELECT u.user_id as "userId",
              u.email,
              u.display_name as "displayName",
              u.status,
              COALESCE(array_agg(distinct r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) as roles
         FROM auth.tenancy_members tm
         JOIN auth.users u ON u.user_id = tm.user_id
         LEFT JOIN auth.user_roles ur ON ur.user_id = u.user_id
         LEFT JOIN auth.roles r ON r.role_id = ur.role_id
        WHERE tm.tenancy_id = $1
        GROUP BY u.user_id, u.email, u.display_name, u.status
        ORDER BY u.display_name NULLS LAST`,
      [tenancyId],
      { tenantId: tenancyId },
    );
    return result.rows;
  }

  async findOne(userId: string): Promise<UserSummary | null> {
    const result = await this.db.query<UserSummary>(
      `SELECT u.user_id as "userId",
              u.email,
              u.display_name as "displayName",
              u.status,
              COALESCE(array_agg(distinct r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) as roles
         FROM auth.users u
         LEFT JOIN auth.user_roles ur ON ur.user_id = u.user_id
         LEFT JOIN auth.roles r ON r.role_id = ur.role_id
        WHERE u.user_id = $1
        GROUP BY u.user_id, u.email, u.display_name, u.status`,
      [userId],
    );
    return result.rows[0] ?? null;
  }
}
