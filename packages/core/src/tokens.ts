export const STYNX_CORE_OPTIONS = Symbol('STYNX_CORE_OPTIONS');
export const STYNX_CORE_CONFIG = Symbol('STYNX_CORE_CONFIG');
export const STYNX_SYSTEM_OPERATION_SINK = Symbol('STYNX_SYSTEM_OPERATION_SINK');
export const STYNX_ERROR_TRANSLATOR = Symbol('STYNX_ERROR_TRANSLATOR');

export interface SystemOperationRecord {
  reason: string;
  requestId: string;
  actorId?: string;
  occurredAt: string;
}

export interface SystemOperationSink {
  write(record: SystemOperationRecord): Promise<void> | void;
}

export interface ErrorTranslator {
  translate(key: string, locale: string, vars?: Record<string, unknown>): string;
}
