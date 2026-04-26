import type { DestinationStream } from 'pino';

export interface StynxLoggingOptions {
  level?: string;
  redactPaths?: string[];
  additionalRedactPaths?: string[];
  dedupeWindowMs?: number;
  skipPaths?: string[];
  destination?: DestinationStream;
}

export const STYNX_LOGGING_OPTIONS = Symbol('STYNX_LOGGING_OPTIONS');
export const STYNX_PINO_LOGGER = Symbol('STYNX_PINO_LOGGER');
