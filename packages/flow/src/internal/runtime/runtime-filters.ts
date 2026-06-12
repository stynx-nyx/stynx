import { camelizeRow, pageLimitOffset, type FlowRow } from '../../row-utils';
import type { FlowJsonObject } from '../../types';

export type RuntimeFilterInput = Record<string, unknown>;

export interface PendingEffectRow extends FlowRow {
  event_id: string;
  run_id: string;
  node_id?: string | null;
  task_id?: string | null;
  adapter_key: string;
  target_type: string;
  target_id: string;
  node_code?: string | null;
  action?: string | null;
  payload: FlowJsonObject;
}

export interface TaskAccessRow extends FlowRow {
  assignee_user_id?: string | null;
  is_user_candidate?: boolean;
  adapter_key: string;
  target_type: string;
  target_id: string;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function addUuidFilter(
  where: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}::uuid`);
}

export function addTextFilter(
  where: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}`);
}

export function asJsonObject(value: unknown): FlowJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as FlowJsonObject
    : {};
}

export { camelizeRow, pageLimitOffset, type FlowRow };
