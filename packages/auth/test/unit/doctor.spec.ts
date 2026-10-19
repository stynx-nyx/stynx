import { verifyAuthMutationCoverage } from '../../src/doctor.js';

describe('verifyAuthMutationCoverage', () => {
  it('tracks the six ADR-002 mutation paths exactly', () => {
    expect(verifyAuthMutationCoverage()).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
  });
});
