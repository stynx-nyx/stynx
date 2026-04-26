import type { Awaitable } from './auth-provider';

export interface TenantProvider {
  getTenantId(): Awaitable<string | null>;
}
