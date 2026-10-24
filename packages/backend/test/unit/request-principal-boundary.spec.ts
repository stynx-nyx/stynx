import { getPrincipalFromRequest } from '../../src/common/request-context.js';
import type { Principal } from '@stynx-nyx/contracts';

const principal: Principal = { id: 'direct', roles: [], permissions: [], tenants: [], claims: {} };

describe('request principal checked compatibility boundaries', () => {
  it('preserves direct and context identity without reading lower priority getters', () => {
    const lower = vi.fn(() => { throw new Error('must not read'); });
    const request = { headers: {}, principal, get user() { return lower(); } };
    expect(getPrincipalFromRequest(request)).toBe(principal);
    expect(getPrincipalFromRequest({ headers: {}, principalContext: { principal }, get user() { return lower(); } })).toBe(principal);
    expect(lower).not.toHaveBeenCalled();
  });
  it('preserves valid array and opaque claims identities without filtering strings', () => {
    const roles = ['', 'admin']; const permissions = ['']; const tenants = ['t'];
    const claims = { nested: { date: new Date(NaN), missing: undefined } };
    const user = { id: 'u', roles, permissions, tenants, claims, email: '', username: 'name' };
    const result = getPrincipalFromRequest({ headers: {}, user });
    expect(result).toEqual(user);
    expect(result?.roles).toBe(roles); expect(result?.permissions).toBe(permissions);
    expect(result?.tenants).toBe(tenants); expect(result?.claims).toBe(claims);
  });
  it('retains non-array defaults, nullish claims defaults and optional string omission', () => {
    expect(getPrincipalFromRequest({ headers: {}, user: { id: 'u', roles: 'admin', permissions: 1, tenants: null, claims: null, email: 1, username: false } }))
      .toEqual({ id: 'u', roles: [], permissions: [], tenants: [], claims: {} });
  });
  it.each(['roles', 'permissions', 'tenants'])('rejects mixed and sparse %s without actor downgrade', (field) => {
    const sparse = new Array(2); sparse[1] = 'admin';
    for (const values of [sparse, ['valid', 1]]) {
      const actor = vi.fn(() => principal);
      expect(getPrincipalFromRequest({ headers: {}, user: { id: 'u', [field]: values }, get actor() { return actor(); } })).toBeUndefined();
      expect(actor).not.toHaveBeenCalled();
    }
  });
  it.each([17, true, {}, ['id']].map((id) => ({ id })))('rejects truthy malformed identity $id without downgrade', ({ id }) => {
    const actor = vi.fn(() => principal);
    expect(getPrincipalFromRequest({ headers: {}, user: { id }, get actor() { return actor(); } })).toBeUndefined();
    expect(actor).not.toHaveBeenCalled();
  });
  it.each([false, 0, '', null, undefined])('retains actor fallback for falsy user id %s', (id) => {
    expect(getPrincipalFromRequest({ headers: {}, user: { id }, actor: principal })).toEqual(principal);
  });
  it.each([[], 1, 'claims'].map((claims) => ({ claims })))('refuses malformed claims $claims without fallback', ({ claims }) => {
    expect(getPrincipalFromRequest({ headers: {}, user: { id: 'u', claims }, actor: principal })).toBeUndefined();
  });
});
