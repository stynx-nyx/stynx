import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

export interface RoleDto {
  roleId: string;
  code: string;
  name: string;
  description: string | null;
}

@Injectable()
export class RolesService {
  constructor(private readonly db: DatabaseService) {}

  async list(): Promise<RoleDto[]> {
    const result = await this.db.query<RoleDto>(
      `SELECT role_id as "roleId", code, name, description
         FROM auth.roles
        ORDER BY code`,
    );
    return result.rows;
  }

  async create(payload: { code: string; name: string; description?: string | null; actorId: string }): Promise<RoleDto> {
    const result = await this.db.query<RoleDto>(
      `INSERT INTO auth.roles (code, name, description)
       VALUES ($1,$2,$3)
       RETURNING role_id as "roleId", code, name, description`,
      [payload.code, payload.name, payload.description ?? null],
      { userId: payload.actorId },
    );
    return result.rows[0];
  }

  async assignRole(payload: { roleCode: string; userId: string; actorId: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO auth.user_roles (user_id, role_id, assigned_by)
       SELECT $2, r.role_id, $3
         FROM auth.roles r
        WHERE lower(r.code) = lower($1)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [payload.roleCode, payload.userId, payload.actorId],
      { userId: payload.actorId },
    );
  }
}
