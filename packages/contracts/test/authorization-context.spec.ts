import type { PolicyEvaluationContext } from '../src/authorization';
import type { Principal } from '../src/auth';

describe('PolicyEvaluationContext tenant and principal contract', () => {
  it('carries the verified tenant independently of unchanged principal claims', () => {
    const principal: Principal = {
      id: 'actor-1', roles: [], permissions: [], tenants: [], claims: { sid: 'sid-1', custom: 'kept' },
    };
    const context: PolicyEvaluationContext = {
      principal,
      requirements: {},
      tenantId: 'tenant-1',
    };
    expect(context.tenantId).toBe('tenant-1');
    expect(context.principal).toBe(principal);
    expect(context.principal.claims).toEqual({ sid: 'sid-1', custom: 'kept' });
  });

  it('allows tenant context to be absent before verified tenant enrichment', () => {
    const context: PolicyEvaluationContext = {
      principal: { id: 'actor-1', roles: [], permissions: [], tenants: [], claims: {} },
      requirements: {},
    };
    expect(context.tenantId).toBeUndefined();
  });
});
