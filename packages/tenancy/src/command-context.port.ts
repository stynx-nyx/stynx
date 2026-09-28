import type { ResolvedTenantCommandContextPort } from '@stynx-nyx/contracts';

type Resolved = NonNullable<ReturnType<ResolvedTenantCommandContextPort['get']>>;
const resolved = new WeakMap<object, Resolved>();

class ResolvedTenantCommandContextReader implements ResolvedTenantCommandContextPort {
  get(request: object): Resolved | undefined {
    return resolved.get(request);
  }
}

export const resolvedTenantCommandContextPort: ResolvedTenantCommandContextPort = new ResolvedTenantCommandContextReader();

// This writer is internal to the tenancy module and is never exposed through DI.
export function recordResolvedTenantCommandContext(request: object, value: Resolved): void {
  resolved.set(request, value);
}
