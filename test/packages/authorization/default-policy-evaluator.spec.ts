import { DefaultPolicyEvaluator } from '../../../packages/backend/src/authorization/default-policy-evaluator';

describe('DefaultPolicyEvaluator', () => {
  const evaluator = new DefaultPolicyEvaluator();

  const principal = {
    id: 'u1',
    roles: ['admin', 'auditor'],
    permissions: ['reports:read', 'users:update'],
    tenants: ['t1'],
    claims: {},
  };

  it('allows when all role+permission requirements are met', () => {
    const allowed = evaluator.evaluate({
      principal,
      requirements: {
        roles: { roles: ['ADMIN', 'AUDITOR'], mode: 'all' },
        permissions: { permissions: ['reports:read'], mode: 'all' },
      },
    });

    expect(allowed).toBe(true);
  });

  it('denies when any requirement set fails', () => {
    const allowed = evaluator.evaluate({
      principal,
      requirements: {
        roles: { roles: ['admin'], mode: 'all' },
        permissions: { permissions: ['reports:delete'], mode: 'all' },
      },
    });

    expect(allowed).toBe(false);
  });

  it('supports any-mode matching', () => {
    const allowed = evaluator.evaluate({
      principal,
      requirements: {
        roles: { roles: ['viewer', 'auditor'], mode: 'any' },
      },
    });

    expect(allowed).toBe(true);
  });
});
