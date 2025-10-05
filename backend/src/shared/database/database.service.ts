import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool, PoolClient, QueryResult } from 'pg';

export interface DbContextOptions {
  tenantId?: string;
  userId?: string;
  roles?: string[];
  correlationId?: string;
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private readonly pool: Pool, private readonly config: ConfigService) {}

  async withClient<T>(
    callback: (client: PoolClient) => Promise<T>,
    context: DbContextOptions = {},
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await this.applyContext(client, context);
      return await callback(client);
    } finally {
      client.release();
    }
  }

  async query<T = unknown>(
    sql: string,
    params: ReadonlyArray<unknown> = [],
    context: DbContextOptions = {},
  ): Promise<QueryResult<T>> {
    return this.withClient((client) => client.query<T>(sql, Array.from(params)), context);
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    context: DbContextOptions = {},
  ): Promise<T> {
    return this.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }, context);
  }

  private async applyContext(client: PoolClient, context: DbContextOptions): Promise<void> {
    const statements: Array<{ text: string; params?: unknown[] }> = [];
    if (context.tenantId) {
      statements.push({ text: 'select auth.set_tenant($1)', params: [context.tenantId] });
    }
    if (context.userId || (context.roles && context.roles.length > 0)) {
      statements.push({
        text: 'select auth.set_user_context($1,$2,$3)',
        params: [
          context.userId ?? null,
          context.roles && context.roles.length ? context.roles : null,
          this.config.get<string>('app.env'),
        ],
      });
    }
    if (context.correlationId) {
      statements.push({ text: "select set_config('stcore.correlation_id',$1,false)", params: [context.correlationId] });
    }
    if (statements.length === 0) {
      return;
    }
    for (const stmt of statements) {
      await client.query(stmt.text, stmt.params);
    }
  }
}
