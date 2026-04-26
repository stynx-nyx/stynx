import { Inject, Injectable } from '@nestjs/common';
import type { Logger } from 'pino';
import { LoggingDedupeService } from './dedupe';
import { RequestLogFieldFactory, type RequestScopedLogFields } from './pino.factory';
import { STYNX_PINO_LOGGER } from './tokens';

type LogContext = string | RequestScopedLogFields;

@Injectable()
export class StynxLogger {
  constructor(
    @Inject(STYNX_PINO_LOGGER)
    private readonly logger: Logger,
    private readonly fieldFactory: RequestLogFieldFactory,
    private readonly dedupe: LoggingDedupeService,
  ) {}

  log(message: string, context?: LogContext): void {
    this.logger.info(this.fieldFactory.create(this.normalizeContext(context)), message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.fieldFactory.create(this.normalizeContext(context)), message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.fieldFactory.create(this.normalizeContext(context)), message);
  }

  verbose(message: string, context?: LogContext): void {
    this.logger.trace(this.fieldFactory.create(this.normalizeContext(context)), message);
  }

  error(
    message: string,
    traceOrContext?: string | RequestScopedLogFields,
    contextOrFields?: LogContext,
  ): void {
    const trace = typeof traceOrContext === 'string' ? traceOrContext : undefined;
    const fields =
      typeof traceOrContext === 'string'
        ? this.normalizeContext(contextOrFields)
        : this.normalizeContext(traceOrContext);
    const decision = this.dedupe.register(message, trace);
    if (!decision.shouldLog) {
      return;
    }
    this.logger.error(
      this.fieldFactory.create({
        ...fields,
        ...(trace ? { stack: trace } : {}),
        ...(decision.suppressedCount
          ? { dedupe_suppressed_count: decision.suppressedCount }
          : {}),
      }),
      message,
    );
  }

  private normalizeContext(context?: LogContext): RequestScopedLogFields | undefined {
    if (!context) {
      return undefined;
    }
    if (typeof context === 'string') {
      return { context };
    }
    return context;
  }
}
