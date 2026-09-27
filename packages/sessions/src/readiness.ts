import type { SessionStore } from './types';

/** Structural health indicator; hosts compose it with StynxHealthModule. */
export function createSessionStoreReadinessIndicator(
  store: SessionStore,
  options: { timeoutMs?: number } = {},
): { name: string; check(): Promise<{ status: 'up' | 'down'; details?: Record<string, unknown> }> } {
  const timeoutMs = options.timeoutMs ?? 500;
  return {
    name: 'stynx-session-store',
    async check() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = store.probeReadiness
          ? store.probeReadiness()
          : store.getSession('00000000-0000-0000-0000-000000000000').then(() => true);
        const ready = await Promise.race([
          work,
          new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
        ]);
        return ready ? { status: 'up' as const } : { status: 'down' as const, details: { reason: 'store-unavailable' } };
      } catch {
        return { status: 'down' as const, details: { reason: 'store-unavailable' } };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
