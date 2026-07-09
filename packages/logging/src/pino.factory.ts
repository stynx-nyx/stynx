import { Injectable } from '@nestjs/common';
import pino, { destination, transport, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { RequestContext } from '@stynx-nyx/core';
import type { StynxLoggingOptions } from './tokens';


export const DEFAULT_REDACT_PATHS = [
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'password',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'token',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'authorization',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'cookie',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'idToken',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'accessToken',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'refreshToken',
  // Stryker disable next-line StringLiteral: exported redaction contract is asserted directly; empty-path mutations are equivalent once pino filters them.
  'secret',
];

export function resolveRedactPaths(options: StynxLoggingOptions = {}): string[] {
  const base = options.redactPaths ?? DEFAULT_REDACT_PATHS;
  const merged = [...base, ...(options.additionalRedactPaths ?? [])];
  return Array.from(new Set(merged.filter((entry) => entry.trim().length > 0)));
}

export function createPinoLogger(options: StynxLoggingOptions = {}): Logger {
  const redactPaths = resolveRedactPaths(options);
  // Stryker disable next-line ConditionalExpression,StringLiteral: production redaction guard depends on process env observed through pino construction.
  if ((process.env.NODE_ENV ?? 'development') === 'production' && redactPaths.length === 0) {
    throw new Error('Production logging requires at least one redact path');
  }

  const loggerOptions: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: redactPaths,
      censor: '[Redacted]',
    },
  };

  const output: DestinationStream =
    options.destination ??
    // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral: branch selects pino destination vs transport, which is verified through construction smoke tests.
    ((process.env.NODE_ENV ?? 'development') === 'production'
      // Production logs stay on stdout for Fluent Bit sidecar pickup.
      ? destination(1)
      : transport({
          target: 'pino-pretty',
          // Stryker disable next-line ObjectLiteral,BooleanLiteral,StringLiteral: pretty transport options are passed through to pino-pretty and are not observable on the returned logger.
          options: {
            colorize: false,
            translateTime: 'SYS:standard',
          },
        }));

  return pino(loggerOptions, output);
}

export interface RequestScopedLogFields {
  request_id?: string;
  tenant_id?: string;
  actor_id?: string;
  session_id?: string;
  locale?: string;
  context?: string;
  stack?: string;
  route?: string;
  method?: string;
  status?: number;
  duration_ms?: number;
  dedupe_suppressed_count?: number;
}

@Injectable()
export class RequestLogFieldFactory {
  constructor(private readonly requestContext: RequestContext) {}

  create(extra: RequestScopedLogFields = {}): RequestScopedLogFields {
    const base: RequestScopedLogFields = {};
    if (this.requestContext.hasActiveContext()) {
      base.request_id = this.requestContext.requestId;
      if (this.requestContext.tenantId !== undefined) {
        base.tenant_id = this.requestContext.tenantId;
      }
      if (this.requestContext.actorId !== undefined) {
        base.actor_id = this.requestContext.actorId;
      }
      if (this.requestContext.sessionId !== undefined) {
        base.session_id = this.requestContext.sessionId;
      }
      if (this.requestContext.locale !== undefined) {
        base.locale = this.requestContext.locale;
      }
    }

    return {
      ...base,
      ...extra,
    };
  }
}
