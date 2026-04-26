import { SetMetadata } from '@nestjs/common';
import { STYNX_RATE_LIMIT_ROUTE } from './constants';
import type { RateLimitMetadata } from './types';

export function RateLimit(metadata: RateLimitMetadata): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_RATE_LIMIT_ROUTE, metadata);
}
