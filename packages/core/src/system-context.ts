import { Inject, Injectable, Optional } from '@nestjs/common';
import type { SystemExecutionContext } from './database';
import { SystemContextRequiredError } from './errors';
import { RequestContext, RequestContextMutator } from './request-context';
import {
  STYNX_SYSTEM_OPERATION_SINK,
  type SystemOperationRecord,
  type SystemOperationSink,
} from './tokens';

class NoopSystemOperationSink implements SystemOperationSink {
  async write(_record: SystemOperationRecord): Promise<void> {}
}

@Injectable()
export class SystemContext {
  private readonly sink: SystemOperationSink;

  constructor(
    private readonly requestContext: RequestContext,
    private readonly requestContextMutator: RequestContextMutator,
    @Optional()
    @Inject(STYNX_SYSTEM_OPERATION_SINK)
    sink?: SystemOperationSink,
  ) {
    this.sink = sink ?? new NoopSystemOperationSink();
  }

  current(): SystemExecutionContext {
    const current = this.requestContextMutator.getSystemContext();
    if (!current) {
      throw new SystemContextRequiredError();
    }
    return current;
  }

  async withSystemContext<T>(
    reason: string,
    fn: (context: SystemExecutionContext) => Promise<T>,
  ): Promise<T> {
    if (reason.trim().length < 10) {
      throw new SystemContextRequiredError(reason);
    }

    return this.requestContextMutator.runWithSystemContext(reason.trim(), async (context) => {
      await this.sink.write({
        reason: context.reason,
        requestId: context.requestId,
        ...(this.requestContext.hasActiveContext() && this.requestContext.actorId !== undefined
          ? { actorId: this.requestContext.actorId }
          : {}),
        occurredAt: context.startedAt.toISOString(),
      });

      return fn(context);
    });
  }
}

export function withSystemContext<T>(
  systemContext: Pick<SystemContext, 'withSystemContext'>,
  reason: string,
  fn: (context: SystemExecutionContext) => Promise<T>,
): Promise<T> {
  return systemContext.withSystemContext(reason, fn);
}
