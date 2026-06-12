// @ts-nocheck
import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/data',
  concurrency: 6,
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/database.ts',
    'src/internal/archive-relations.ts',
    'src/internal/archive-restore.ts',
    'src/internal/soft-delete-cascade.ts',
    'src/query-helpers.ts',
    'src/transaction.ts',
  ],
  // `timeoutMS: 1000` override removed per WAVE-05A Phase 0 / Audit Finding #3
  // (2026-05-19): the aggressive timeout was inflating data's mutation score
  // by ~12 % via Timeout-counted-as-killed. Factory default (60 s) now applies.
});
