import { Injectable } from '@nestjs/common';
import pino, { destination, transport, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { RequestContext } from '@stynx/core';
import type { StynxLoggingOptions } from './tokens';

export const DEFAULT_REDACT_PATHS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'idToken',
  'accessToken',
  'refreshToken',
  'secret',
];

export function resolveRedactPaths(options: StynxLoggingOptions = {}): string[] {
  const base = options.redactPaths ?? DEFAULT_REDACT_PATHS;
  const merged = [...base, ...(options.additionalRedactPaths ?? [])];
  return Array.from(new Set(merged.filter((entry) => entry.trim().length > 0)));
}

export function createPinoLogger(options: StynxLoggingOptions = {}): Logger {
  const redactPaths = resolveRedactPaths(options);
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
    ((process.env.NODE_ENV ?? 'development') === 'production'
      // Production logs stay on stdout for Fluent Bit sidecar pickup.
      ? destination(1)
      : transport({
          target: 'pino-pretty',
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
