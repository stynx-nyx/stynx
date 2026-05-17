import { BadRequestException } from '@nestjs/common';

export type FlowRow = Record<string, unknown>;

export function camelizeKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function camelizeRow<T extends FlowRow>(row: T): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelizeKey(key)] = value;
  }
  return mapped;
}

export function requireObject(input: unknown): Record<string, unknown> {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  throw new BadRequestException('Request body must be an object');
}

export function pageLimitOffset(query: Record<string, unknown>): {
  limit: number;
  offset: number;
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50) || 50));
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
