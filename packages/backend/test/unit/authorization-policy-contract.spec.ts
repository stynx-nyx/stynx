import { DefaultPolicyEvaluator } from '../../src/authorization/default-policy-evaluator';
import type { Principal } from '@stynx-nyx/contracts';

describe('DefaultPolicyEvaluator permission matching contract', () => {
  const principal: Principal = {
    id: 'actor-1',
    roles: ['Operator'],
    permissions: ['OPS:CASE:READ', 'profile:read', 'ops:*'],
    tenants: ['tenant-1'],
    claims: { sid: 'session-1' },
  };
  const evaluator = new DefaultPolicyEvaluator();
  const allows = (required: string) => evaluator.evaluate({
    principal,
    requirements: { permissions: { permissions: [required] } },
  });

  it.each([
    ['exact permission, case insensitive', 'ops:case:read', true],
    ['resource wildcard', 'ops:read', true],
    ['nested resource wildcard', 'ops:case:write', true],
    ['role matching remains case insensitive', 'profile:read', true],
  ])('grants %s', (_label, permission, expected) => {
    expect(allows(permission as string)).toBe(expected);
  });

  it.each([
    ['cross-resource wildcard denial', 'inf:x'],
    ['bare resource denial', 'ops'],
    ['resource-prefix collision denial', 'ops2:read'],
    ['wildcard requirement is literal', 'ops:case:*'],
    ['absent permission denial', 'profile:write'],
  ])('denies %s', (_label, permission) => {
    expect(allows(permission)).toBe(false);
  });

  it('does not let a nested wildcard grant a sibling resource prefix', () => {
    expect(evaluator.evaluate({
      principal: { ...principal, permissions: ['ops:case:*'] },
      requirements: { permissions: { permissions: ['ops:caser'] } },
    })).toBe(false);
  });

  it('keeps role matching exact apart from case folding', () => {
    expect(evaluator.evaluate({
      principal,
      requirements: { roles: { roles: ['operator'] } },
    })).toBe(true);
    expect(evaluator.evaluate({
      principal,
      requirements: { roles: { roles: ['oper*'] } },
    })).toBe(false);
  });

  it('allows a granted global wildcard for any concrete permission', () => {
    expect(evaluator.evaluate({
      principal: { ...principal, permissions: ['*'] },
      requirements: { permissions: { permissions: ['inf:x'] } },
    })).toBe(true);
  });

  it('treats an explicit empty permission requirement as satisfied', () => {
    expect(evaluator.evaluate({
      principal: { ...principal, permissions: [] },
      requirements: { permissions: { permissions: [] } },
    })).toBe(true);
  });
});
