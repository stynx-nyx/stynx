import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Database, Transaction } from '@stynx-nyx/data';
import { camelizeRow, type FlowRow } from './runtime-filters';

@Injectable()
export class FlowRuntimeReadModel {
  constructor(private readonly db: Database) {}

  async scopeCodeForId(scopeId: string | undefined): Promise<string> {
    if (!scopeId) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    return this.getOne('select code from flow.scopes where id = $1::uuid limit 1', [scopeId], 'Scope not found')
      .then((scope) => String(scope.code));
  }

  async scopeIdForCode(scopeCode: string | undefined): Promise<string> {
    if (!scopeCode) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    return this.getOne('select id from flow.scopes where code = $1 limit 1', [scopeCode], 'Scope not found')
      .then((scope) => String(scope.id));
  }

  async list(sql: string, values: unknown[]): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(sql, values);
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  async getOne(
    sql: string,
    values: unknown[],
    notFoundMessage: string,
  ): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(sql, values);
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException(notFoundMessage);
      }
      return camelizeRow(row);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  async getTaskFromTransaction(trx: Transaction, id: string): Promise<Record<string, unknown>> {
    const result = await trx.query<FlowRow>(
      `
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.id = $1::uuid
        limit 1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return camelizeRow(row);
  }
}
