import * as Contracts from '../src/index';

describe('@stynx/contracts barrel', () => {
  it('re-exports core error classes', () => {
    expect(typeof (Contracts as { StynxError?: unknown }).StynxError).toBe('function');
    expect(typeof (Contracts as { AuthenticationError?: unknown }).AuthenticationError).toBe('function');
    expect(typeof (Contracts as { AuthorizationError?: unknown }).AuthorizationError).toBe('function');
    expect(typeof (Contracts as { IdentityAdminError?: unknown }).IdentityAdminError).toBe('function');
  });

  it('barrel has multiple exports', () => {
    expect(Object.keys(Contracts).length).toBeGreaterThan(3);
  });
});
