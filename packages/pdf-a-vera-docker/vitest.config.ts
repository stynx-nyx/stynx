import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/pdf-a-vera-docker',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx-nyx/pdf-a': resolve(__dirname, '../pdf-a/src/index.ts'),
    '@stynx-nyx/logging': resolve(__dirname, '../logging/src/index.ts'),
  },
  singleThread: true,
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  testTimeout: 420000,
  // The veraPDF image is linux/amd64 only, emulated via qemu on the local
  // arm64 Docker VM. The emulated JVM intermittently aborts (qemu signal 6)
  // and the container then hangs at 0% CPU, so integration attempts get a
  // retry with a fresh container (the per-attempt budget lives in
  // test/integration/docker-support.ts). Healthy containers finish in ~15s;
  // retries are for the emulator crash, not real failures.
  retry: 2,
});
