import type { Transaction } from '@stynx-nyx/data';
import { OfflineSyncConfigurationError } from './errors';
import type {
  CTG9SyncBatchItemInput,
  DurableBatchExecutionOptions,
  OfflineSyncConcurrentPair,
  OfflineSyncItemContext,
} from './types';

/** Trusted pair witnesses are checked before a handoff can exempt them. */
export async function prepareOfflineSyncItem(
  trx: Transaction,
  item: CTG9SyncBatchItemInput,
  original: OfflineSyncItemContext,
  execution: DurableBatchExecutionOptions,
  exists: (queueItemId: string) => Promise<boolean>,
): Promise<{
  context: OfflineSyncItemContext;
  pairs: readonly OfflineSyncConcurrentPair[];
  defer: boolean;
}> {
  const detector = execution.ports.preApplyDetector;
  const policy = execution.policy.concurrencyApplication ?? 'defer';
  if (policy !== 'apply' && policy !== 'defer')
    throw new OfflineSyncConfigurationError('concurrencyApplication');
  if (!detector) return { context: original, pairs: [], defer: false };
  const result = await detector.detect(trx, item, original);
  if (
    !result ||
    typeof result.suspected !== 'boolean' ||
    !Array.isArray(result.pairs) ||
    result.suspected !== result.pairs.length > 0
  )
    throw new OfflineSyncConfigurationError('preApplyDetector');
  const pairs: OfflineSyncConcurrentPair[] = [];
  const seen = new Set<string>();
  for (const pair of result.pairs) {
    if (
      !pair ||
      typeof pair.firstItemId !== 'string' ||
      typeof pair.secondItemId !== 'string' ||
      !pair.firstItemId ||
      !pair.secondItemId ||
      pair.firstItemId === pair.secondItemId ||
      ![pair.firstItemId, pair.secondItemId].includes(item.queueItemId) ||
      !(await exists(pair.firstItemId)) ||
      !(await exists(pair.secondItemId))
    )
      throw new OfflineSyncConfigurationError('preApplyDetector');
    const identity = JSON.stringify([pair.firstItemId, pair.secondItemId].sort());
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (await execution.ports.handoffPort?.permits(trx, pair, original)) continue;
    pairs.push({ firstItemId: pair.firstItemId, secondItemId: pair.secondItemId });
  }
  return {
    context: { ...original, concurrencySuspected: pairs.length > 0, concurrentPairs: pairs },
    pairs,
    defer: pairs.length > 0 && policy === 'defer',
  };
}
