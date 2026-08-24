import { describe, expect, it } from 'vitest';
import {
  BUILTIN_WORKLIST_STRATEGY_KEYS,
  LoadBalancedWorklistStrategy,
  RoundRobinWorklistStrategy,
  WorklistStrategyRegistry,
} from '../../src/strategies';
import type { WorklistCandidate, WorklistDistributionStrategy } from '../../src/types';

const candidates: WorklistCandidate[] = [
  {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
    openItemCount: 4,
    weight: 2,
    available: true,
    lastAssignedAt: new Date('2026-08-24T10:00:00.000Z'),
  },
  {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e201b2',
    openItemCount: 1,
    weight: 1,
    available: true,
    lastAssignedAt: null,
  },
  {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e201c3',
    openItemCount: 0,
    weight: 1,
    available: false,
    lastAssignedAt: null,
  },
];

describe('worklist distribution strategies', () => {
  it('reserves the canonical built-in keys', () => {
    expect(BUILTIN_WORKLIST_STRATEGY_KEYS).toEqual(['pull', 'round_robin', 'load_balanced']);
  });

  it('round-robins by availability, oldest cursor, then stable user id', async () => {
    const strategy = new RoundRobinWorklistStrategy();
    await expect(strategy.select({ queueId: 'queue-1', candidates })).resolves.toBe(
      '01978f4a-32bf-7c27-a131-fd73a9e201b2',
    );
  });

  it('load-balances by weighted open count before rotation age', async () => {
    const strategy = new LoadBalancedWorklistStrategy();
    await expect(strategy.select({ queueId: 'queue-1', candidates })).resolves.toBe(
      '01978f4a-32bf-7c27-a131-fd73a9e201b2',
    );
  });

  it('registers adopter strategies but rejects built-in replacement and duplicates', async () => {
    const expertise: WorklistDistributionStrategy = {
      key: 'expertise_v1',
      select: async ({ candidates: eligible }) => eligible.at(-1)?.userId ?? null,
    };
    const registry = new WorklistStrategyRegistry([expertise]);

    expect(registry.get('expertise_v1')).toBe(expertise);
    await expect(
      registry.get('expertise_v1')?.select({ queueId: 'queue-1', candidates }),
    ).resolves.toBe('01978f4a-32bf-7c27-a131-fd73a9e201c3');
    expect(() => registry.register(expertise)).toThrow('already registered');
    expect(() => registry.register({ ...expertise, key: 'round_robin' })).toThrow('reserved');
  });

  it('fails closed for unknown strategy keys', () => {
    expect(() => new WorklistStrategyRegistry().require('missing')).toThrow(
      'Unknown worklist strategy',
    );
  });
});
