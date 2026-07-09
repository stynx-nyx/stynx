import { describe, expect, it } from 'vitest';
import { getCoverageThreshold } from './test-thresholds.mjs';

describe('coverage threshold policy resolution', () => {
  it('resolves @stynx-nyx/auth to the complete policy verbatim', () => {
    expect(getCoverageThreshold('@stynx-nyx/auth')).toEqual({
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
      branchesTolerance: 0,
    });
  });
});
