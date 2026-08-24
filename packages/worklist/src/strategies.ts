import { UnknownWorklistStrategyError, WorklistStrategyRegistrationError } from './errors';
import type {
  WorklistCandidate,
  WorklistDistributionContext,
  WorklistDistributionStrategy,
} from './types';

export const BUILTIN_WORKLIST_STRATEGY_KEYS = ['pull', 'round_robin', 'load_balanced'] as const;

export type BuiltinWorklistStrategyKey = (typeof BUILTIN_WORKLIST_STRATEGY_KEYS)[number];

function availableCandidates(candidates: WorklistCandidate[]): WorklistCandidate[] {
  return candidates.filter((candidate) => candidate.available);
}

export class RoundRobinWorklistStrategy implements WorklistDistributionStrategy {
  readonly key = 'round_robin';

  async select(context: WorklistDistributionContext): Promise<string | null> {
    const candidates = availableCandidates(context.candidates).sort((left, right) => {
      const leftTime = left.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightTime = right.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return leftTime - rightTime || left.userId.localeCompare(right.userId);
    });
    return candidates[0]?.userId ?? null;
  }
}

export class LoadBalancedWorklistStrategy implements WorklistDistributionStrategy {
  readonly key = 'load_balanced';

  async select(context: WorklistDistributionContext): Promise<string | null> {
    const candidates = availableCandidates(context.candidates).sort((left, right) => {
      const load = left.openItemCount / left.weight - right.openItemCount / right.weight;
      const leftTime = left.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightTime = right.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return load || leftTime - rightTime || left.userId.localeCompare(right.userId);
    });
    return candidates[0]?.userId ?? null;
  }
}

export class WorklistStrategyRegistry {
  private readonly strategies = new Map<string, WorklistDistributionStrategy>();

  constructor(strategies: WorklistDistributionStrategy[] = []) {
    for (const strategy of strategies) {
      this.register(strategy);
    }
  }

  register(strategy: WorklistDistributionStrategy): void {
    const key = strategy.key.trim();
    if (BUILTIN_WORKLIST_STRATEGY_KEYS.includes(key as BuiltinWorklistStrategyKey)) {
      throw new WorklistStrategyRegistrationError(`Worklist strategy key ${key} is reserved`, key);
    }
    if (this.strategies.has(key)) {
      throw new WorklistStrategyRegistrationError(
        `Worklist strategy ${key} is already registered`,
        key,
      );
    }
    this.strategies.set(key, strategy);
  }

  get(key: string): WorklistDistributionStrategy | undefined {
    return this.strategies.get(key);
  }

  require(key: string): WorklistDistributionStrategy {
    const strategy = this.get(key);
    if (!strategy) {
      throw new UnknownWorklistStrategyError(key);
    }
    return strategy;
  }
}
