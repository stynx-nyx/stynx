import { SetMetadata } from '@nestjs/common';
import { STYNX_IDEMPOTENT_ROUTE, STYNX_NO_IDEMPOTENT_ROUTE } from './constants';
import type { IdempotentMetadata } from './types';

export function Idempotent(headerName = 'Idempotency-Key', ttlMs?: number): MethodDecorator & ClassDecorator {
  const metadata: IdempotentMetadata = { headerName, ...(ttlMs ? { ttlMs } : {}) };
  return SetMetadata(STYNX_IDEMPOTENT_ROUTE, metadata);
}

export function NoIdempotent(): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_NO_IDEMPOTENT_ROUTE, true);
}
