import { pool } from '../db';

export class RecordsService {
  list() {
    return pool.query('select * from resource_record');
  }

  get(id: string) {
    return pool.query('select * from resource_record where id = $1', [id]);
  }

  create(dto: Record<string, unknown>) {
    return pool.query('insert into resource_record (organization_id, label) values ($1, $2)', [dto.organizationId, dto.label]);
  }

  remove(id: string) {
    return pool.query('delete from resource_record where id = $1', [id]);
  }
}
