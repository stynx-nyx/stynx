import { Transaction } from '@stynx-nyx/data';
import type { OfflineSyncHookContext, OfflineSyncItemApplier, OfflineSyncEventPort, OfflineSyncConcurrencyDetector, OfflineSyncHandoffPort, OfflineSyncConflictResolver } from '@stynx-nyx/offline-sync';

export function preserve(context: OfflineSyncHookContext): object {
  // @ts-expect-error An opaque carrier does not promise SQL access.
  context.query('select 1');
  // @ts-expect-error An opaque carrier does not promise checked execution.
  void context.run;
  // @ts-expect-error An opaque carrier does not promise transaction completion.
  void context.commit;
  if (context instanceof Transaction) {
    const native: Transaction = context;
    native.query('select 1');
    void native.run;
    return native;
  }
  const token: string | undefined = context.token;
  void token;
  return context;
}
export const empty: OfflineSyncHookContext = {};
export const memory: OfflineSyncHookContext = { token: 'identity-token' };
export const item: OfflineSyncItemApplier = { async apply(context) { preserve(context); return { serverEntityId: 'server' }; } };
export const events: OfflineSyncEventPort = {
  async appendInTransaction(context) { preserve(context); },
  async appendManyInTransaction(context) { preserve(context); },
};
export const detector: OfflineSyncConcurrencyDetector = { async detect(context) { preserve(context); return { suspected: false, pairs: [] }; } };
export const handoff: OfflineSyncHandoffPort = { async permits(context) { preserve(context); return true; } };
export const resolver: OfflineSyncConflictResolver = {
  async resolve(context) { preserve(context); throw new Error('consumer resolution'); },
  async allowedActions(context) { preserve(context); return ['server-wins']; },
};
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type SevenExactContexts = [
  Assert<Equal<Parameters<OfflineSyncItemApplier['apply']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<OfflineSyncEventPort['appendInTransaction']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<OfflineSyncEventPort['appendManyInTransaction']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<OfflineSyncConcurrencyDetector['detect']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<OfflineSyncHandoffPort['permits']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<OfflineSyncConflictResolver['resolve']>[0], OfflineSyncHookContext>>,
  Assert<Equal<Parameters<NonNullable<OfflineSyncConflictResolver['allowedActions']>>[0], OfflineSyncHookContext>>
];
