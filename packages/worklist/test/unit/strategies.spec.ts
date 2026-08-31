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

  it('observes availability, weight, cursor, stable-id, and registry boundaries independently', async () => {
    const selectable: WorklistCandidate[] = [
      {
        userId: 'user-z',
        available: true,
        weight: 4,
        openItemCount: 8,
        lastAssignedAt: new Date('2026-08-24T08:00:00.000Z'),
      },
      {
        userId: 'user-a',
        available: true,
        weight: 2,
        openItemCount: 1,
        lastAssignedAt: new Date('2026-08-24T09:00:00.000Z'),
      },
      {
        userId: 'user-0',
        available: false,
        weight: 100,
        openItemCount: 0,
        lastAssignedAt: null,
      },
    ];
    await expect(
      new RoundRobinWorklistStrategy().select({
        queueId: 'queue-observable',
        candidates: selectable,
      }),
    ).resolves.toBe('user-z');
    await expect(
      new LoadBalancedWorklistStrategy().select({
        queueId: 'queue-observable',
        candidates: selectable,
      }),
    ).resolves.toBe('user-a');

    const tie = selectable.slice(0, 2).map((candidate) => ({
      ...candidate,
      weight: 1,
      openItemCount: 1,
      lastAssignedAt: null,
    }));
    await expect(
      new RoundRobinWorklistStrategy().select({ queueId: 'queue-tie', candidates: tie }),
    ).resolves.toBe('user-a');
    await expect(
      new LoadBalancedWorklistStrategy().select({ queueId: 'queue-tie', candidates: tie }),
    ).resolves.toBe('user-a');

    const custom: WorklistDistributionStrategy = { key: 'geo_v2', select: async () => 'user-z' };
    const registry = new WorklistStrategyRegistry();
    expect(registry.register(custom)).toBe(undefined);
    expect(registry.get('geo_v2')).toBe(custom);
    expect(registry.require('geo_v2')).toBe(custom);
  });

  it('binds both strategy keys and round-robin comparator directions exactly', async () => {
    expect(new RoundRobinWorklistStrategy().key).toBe('round_robin');
    expect(new LoadBalancedWorklistStrategy().key).toBe('load_balanced');
    const older = {
      userId: 'older',
      available: true,
      weight: 1,
      openItemCount: 1,
      lastAssignedAt: new Date('2026-08-24T08:00:00.000Z'),
    };
    const newer = {
      ...older,
      userId: 'newer',
      lastAssignedAt: new Date('2026-08-24T09:00:00.000Z'),
    };
    const strategy = new RoundRobinWorklistStrategy();
    await expect(
      strategy.select({ queueId: 'queue-order-a', candidates: [older, newer] }),
    ).resolves.toBe('older');
    await expect(
      strategy.select({ queueId: 'queue-order-b', candidates: [newer, older] }),
    ).resolves.toBe('older');
  });

  it('binds weighted-load arithmetic and equal-load age ordering in both input orders', async () => {
    const lowLoad = {
      userId: 'low-load',
      available: true,
      weight: 4,
      openItemCount: 4,
      lastAssignedAt: new Date('2026-08-24T10:00:00.000Z'),
    };
    const highLoad = {
      userId: 'high-load',
      available: true,
      weight: 1,
      openItemCount: 2,
      lastAssignedAt: new Date('2026-08-24T08:00:00.000Z'),
    };
    const strategy = new LoadBalancedWorklistStrategy();
    await expect(
      strategy.select({ queueId: 'queue-load-a', candidates: [lowLoad, highLoad] }),
    ).resolves.toBe('low-load');
    await expect(
      strategy.select({ queueId: 'queue-load-b', candidates: [highLoad, lowLoad] }),
    ).resolves.toBe('low-load');

    const equalNewer = {
      ...lowLoad,
      userId: 'equal-newer',
      lastAssignedAt: highLoad.lastAssignedAt,
    };
    const equalOlder = {
      ...lowLoad,
      userId: 'equal-older',
      lastAssignedAt: new Date('2026-08-24T07:00:00.000Z'),
    };
    await expect(
      strategy.select({ queueId: 'queue-age-a', candidates: [equalNewer, equalOlder] }),
    ).resolves.toBe('equal-older');
    await expect(
      strategy.select({ queueId: 'queue-age-b', candidates: [equalOlder, equalNewer] }),
    ).resolves.toBe('equal-older');
  });

  it('registers a trimmed custom key as the exact public lookup key', () => {
    const custom: WorklistDistributionStrategy = {
      key: '  geographic_v3  ',
      select: async () => null,
    };
    const registry = new WorklistStrategyRegistry();
    expect(registry.register(custom)).toBe(undefined);
    expect(registry.get('geographic_v3')).toBe(custom);
    expect(registry.get('  geographic_v3  ')).toBe(undefined);
  });
});
