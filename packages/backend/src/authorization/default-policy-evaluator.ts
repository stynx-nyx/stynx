import type { PolicyEvaluationContext, PolicyEvaluator } from '@stynx-nyx/contracts';

function includesMatch(values: string[], required: string[], mode: 'all' | 'any' = 'all'): boolean {
  const set = new Set(values.map((v) => v.toLowerCase()));
  const normalizedRequired = required.map((v) => v.toLowerCase());
  if (normalizedRequired.length === 0) return true;
  if (mode === 'any') return normalizedRequired.some((r) => set.has(r));
  return normalizedRequired.every((r) => set.has(r));
}

export class DefaultPolicyEvaluator implements PolicyEvaluator {
  evaluate(context: PolicyEvaluationContext): boolean {
    const { principal, requirements } = context;
    if (requirements.roles) {
      const roleOk = includesMatch(principal.roles, requirements.roles.roles, requirements.roles.mode ?? 'all');
      if (!roleOk) return false;
    }
    if (requirements.permissions) {
      const permissionOk = includesMatch(
        principal.permissions,
        requirements.permissions.permissions,
        requirements.permissions.mode ?? 'all',
      );
      if (!permissionOk) return false;
    }
    return true;
  }
}
