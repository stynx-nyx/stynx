import { SetMetadata } from '@nestjs/common';
import { STYNX_RATE_LIMIT_ROUTE } from './constants.js';
import type { RateLimitMetadata } from './types.js';

export function RateLimit(metadata: RateLimitMetadata): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_RATE_LIMIT_ROUTE, metadata);
}
