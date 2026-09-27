import type { PolicyEvaluationContext, PolicyEvaluator } from '@stynx-nyx/contracts';

function includesMatch(values: string[], required: string[], mode: 'all' | 'any' = 'all'): boolean {
  const set = new Set(values.map((v) => v.toLowerCase()));
  const normalizedRequired = required.map((v) => v.toLowerCase());
  if (normalizedRequired.length === 0) return true;
  if (mode === 'any') return normalizedRequired.some((r) => set.has(r));
  return normalizedRequired.every((r) => set.has(r));
}

function permissionMatches(granted: string, required: string): boolean {
  const grant = granted.toLowerCase();
  const need = required.toLowerCase();
  if (grant === need) return true;
  if (need.includes('*')) return false;
  if (grant === '*') return true;
  if (!/^[^:*]+(?::[^:*]+)*:\*$/u.test(grant)) return false;
  const prefix = grant.slice(0, -1);
  return need.startsWith(prefix) && need.length > prefix.length;
}

function includesPermissions(values: string[], required: string[], mode: 'all' | 'any' = 'all'): boolean {
  if (required.length === 0) return true;
  const matches = (permission: string) => values.some((grant) => permissionMatches(grant, permission));
  return mode === 'any' ? required.some(matches) : required.every(matches);
}

export class DefaultPolicyEvaluator implements PolicyEvaluator {
  evaluate(context: PolicyEvaluationContext): boolean {
    const { principal, requirements } = context;
    if (requirements.roles) {
      const roleOk = includesMatch(principal.roles, requirements.roles.roles, requirements.roles.mode ?? 'all');
      if (!roleOk) return false;
    }
    if (requirements.permissions) {
      const permissionOk = includesPermissions(
        principal.permissions,
        requirements.permissions.permissions,
        requirements.permissions.mode ?? 'all',
      );
      if (!permissionOk) return false;
    }
    return true;
  }
}
