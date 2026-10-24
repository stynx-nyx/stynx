import {
  isRuntimeReadModelRow,
  scopeCodeForIdQuery,
  scopeIdForCodeQuery,
  getRunQuery,
  getNodeRunQuery,
  listRunNodeRunsQuery,
  listRunTasksQuery,
  listRunEventsQuery,
  getTaskFromTransactionQuery,
  taskCandidatesQuery,
  roleUsersQuery,
  roleUsersSearchQuery,
  getTaskUserQuery,
} from './runtime-read-model.repository.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Database, Transaction } from '@stynx-nyx/data';
import { camelizeRow, optionalString } from './runtime-filters.js';

@Injectable()
export class FlowRuntimeReadModel {
  constructor(private readonly db: Database) {}

  async scopeCodeForId(scopeId: string | undefined): Promise<string> {
    if (!scopeId) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(scopeCodeForIdQuery, [scopeId], isRuntimeReadModelRow);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Scope not found');
      }
      return camelizeRow(row);
    }, { role: 'reader', readonly: true }).then((row) => String(row.code));
  }

  async scopeIdForCode(scopeCode: string | undefined): Promise<string> {
    if (!scopeCode) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(scopeIdForCodeQuery, [scopeCode], isRuntimeReadModelRow);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Scope not found');
      }
      return camelizeRow(row);
    }, { role: 'reader', readonly: true }).then((row) => String(row.id));
  }

  getRun(id: string): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(getRunQuery, [id], isRuntimeReadModelRow);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Run not found');
      }
      return camelizeRow(row);
    }, { role: 'reader', readonly: true });
  }

  getNodeRun(id: string): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(getNodeRunQuery, [id], isRuntimeReadModelRow);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Node run not found');
      }
      return camelizeRow(row);
    }, { role: 'reader', readonly: true });
  }

  getTaskUser(id: string): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(getTaskUserQuery, [id], isRuntimeReadModelRow);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('User not found');
      }
      return camelizeRow(row);
    }, { role: 'reader', readonly: true });
  }

  listRunNodeRuns(runId: string): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(listRunNodeRunsQuery, [runId], isRuntimeReadModelRow);
      return rows.map(camelizeRow);
    }, { role: 'reader', readonly: true });
  }

  listRunTasks(runId: string): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(listRunTasksQuery, [runId], isRuntimeReadModelRow);
      return rows.map(camelizeRow);
    }, { role: 'reader', readonly: true });
  }

  listRunEvents(runId: string): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(listRunEventsQuery, [runId], isRuntimeReadModelRow);
      return rows.map(camelizeRow);
    }, { role: 'reader', readonly: true });
  }

  taskCandidates(id: string): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const rows = await trx.runGuarded(taskCandidatesQuery, [id], isRuntimeReadModelRow);
      return rows.map(camelizeRow);
    }, { role: 'reader', readonly: true });
  }

  getTask(id: string): Promise<Record<string, unknown>> {
    return this.db.tx((trx) => this.getTaskFromTransaction(trx, id), {
      role: 'reader', readonly: true,
    });
  }

  listUsersForRole(role: string, search?: string): Promise<Record<string, unknown>[]> {
    const searchValue = optionalString(search) ? `%${search}%` : undefined;
    return this.db.tx(async (trx) => {
      const rows = searchValue === undefined
        ? await trx.runGuarded(roleUsersQuery, [role], isRuntimeReadModelRow)
        : await trx.runGuarded(roleUsersSearchQuery, [role, searchValue], isRuntimeReadModelRow);
      return rows.map(camelizeRow);
    }, { role: 'reader', readonly: true });
  }

  async getTaskFromTransaction(trx: Transaction, id: string): Promise<Record<string, unknown>> {
    const result = await trx.runGuarded(getTaskFromTransactionQuery, [id], isRuntimeReadModelRow);
    const row = result[0];
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return camelizeRow(row);
  }
}
