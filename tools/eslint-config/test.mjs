// `@stynx-nyx/eslint-config/test`: the test-file profile as a flat-config
// entry point, so `eslint --config <resolved @stynx-nyx/eslint-config/test>`
// works (ESLint requires the default export here; S-38). Severity is `'error'`
// so CI fails on CW-1 violations. Build a customised profile from the named
// `createTestConfig` factory exported by the package root.
import { createTestConfig } from './index.mjs';

export default createTestConfig();
