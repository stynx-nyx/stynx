export interface DbSessionContext {
  userId?: string;
  roles?: string[];
  permissions?: string[];
  tenantId?: string;
  correlationId?: string;
  requestId?: string;
  extras?: Record<string, string | number | boolean | null | undefined>;
}

export interface DbContextApplier<TClient = unknown> {
  apply(client: TClient, context: DbSessionContext): Promise<void>;
}
