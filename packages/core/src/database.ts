export interface SystemExecutionContext {
  readonly reason: string;
  readonly requestId: string;
  readonly actorId?: string;
  readonly startedAt: Date;
}

export abstract class Database {
  abstract withSystemContext<T>(
    reason: string,
    fn: (context: SystemExecutionContext) => Promise<T>,
  ): Promise<T>;
}
