import { EffectiveHashComputer } from './effective-hash-computer';

const expectedMutationMethods = [
  'afterMembershipRoleMutation',
  'afterDirectPermissionMutation',
  'afterGroupMembershipMutation',
  'afterRolePermissionMutation',
  'afterGroupRoleMutation',
  'afterPlatformRoleChange',
];

export function verifyAuthMutationCoverage(): { ok: boolean; missing: string[]; extra: string[] } {
  const prototype = EffectiveHashComputer.prototype as unknown as Record<string, unknown>;
  const available = Object.getOwnPropertyNames(prototype).filter(
    (name) => typeof prototype[name] === 'function' && name !== 'constructor' && name.startsWith('after'),
  );
  return {
    ok: expectedMutationMethods.every((method) => available.includes(method)) && available.length === expectedMutationMethods.length,
    missing: expectedMutationMethods.filter((method) => !available.includes(method)),
    extra: available.filter((method) => !expectedMutationMethods.includes(method)),
  };
}
