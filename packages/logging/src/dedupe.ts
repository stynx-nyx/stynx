import { Injectable } from '@nestjs/common';
import type { StynxLoggingOptions } from './tokens';

interface DedupeEntry {
  expiresAt: number;
  suppressed: number;
}

export interface DedupeDecision {
  shouldLog: boolean;
  suppressedCount?: number;
}

@Injectable()
export class LoggingDedupeService {
  private readonly entries = new Map<string, DedupeEntry>();
  private readonly windowMs: number;

  constructor(options?: StynxLoggingOptions) {
    this.windowMs = options?.dedupeWindowMs ?? 60_000;
  }

  register(message: string, stack?: string): DedupeDecision {
    const key = `${message}\n${stack ?? ''}`;
    const now = Date.now();
    const current = this.entries.get(key);
    if (current && current.expiresAt > now) {
      current.suppressed += 1;
      return { shouldLog: false };
    }

    const decision: DedupeDecision = {
      shouldLog: true,
      ...(current?.suppressed ? { suppressedCount: current.suppressed } : {}),
    };

    this.entries.set(key, {
      expiresAt: now + this.windowMs,
      suppressed: 0,
    });
    return decision;
  }
}
