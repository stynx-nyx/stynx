import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

export interface TenancyDto {
  tenancyId: string;
  code: string;
  name: string;
  isActive: boolean;
}

@Injectable()
export class TenancyService {
  constructor(private readonly db: DatabaseService) {}

  async listForUser(userId: string): Promise<TenancyDto[]> {
    const result = await this.db.query<TenancyDto>(
      `SELECT t.tenancy_id as "tenancyId",
              t.code,
              t.name,
              t.is_active as "isActive"
         FROM auth.tenancy_members tm
         JOIN auth.tenancies t ON t.tenancy_id = tm.tenancy_id
        WHERE tm.user_id = $1
        ORDER BY t.name`,
      [userId],
      { userId },
    );
    return result.rows;
  }

  async createTenancy(input: { code: string; name: string; actorId: string }): Promise<TenancyDto> {
    const result = await this.db.query<TenancyDto>(
      `INSERT INTO auth.tenancies (code, name, created_by)
       VALUES ($1,$2,$3)
       RETURNING tenancy_id as "tenancyId", code, name, is_active as "isActive"`,
      [input.code, input.name, input.actorId],
      { userId: input.actorId },
    );
    return result.rows[0];
  }
}
