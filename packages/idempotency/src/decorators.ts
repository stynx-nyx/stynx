import { SetMetadata } from '@nestjs/common';
import { STYNX_IDEMPOTENT_ROUTE, STYNX_NO_IDEMPOTENT_ROUTE } from './constants';
import type { IdempotentMetadata } from './types';

export function Idempotent(headerNameOrOptions: string | IdempotentMetadata = 'Idempotency-Key', ttlMs?: number): MethodDecorator & ClassDecorator {
  const metadata: IdempotentMetadata = typeof headerNameOrOptions === 'string'
    ? { headerName: headerNameOrOptions, ...(ttlMs ? { ttlMs } : {}) }
    : { ...headerNameOrOptions, headerName: headerNameOrOptions.headerName ?? 'Idempotency-Key' };
  return SetMetadata(STYNX_IDEMPOTENT_ROUTE, metadata);
}

export function NoIdempotent(): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_NO_IDEMPOTENT_ROUTE, true);
}
