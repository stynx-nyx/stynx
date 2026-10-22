import { afterEach, describe, expect, it, vi } from 'vitest';

// checks.ts locates the shared engines/ directory when it loads; a package without it must fail
// loudly at import rather than misreport every check.
describe('check engine location', () => {
  afterEach(() => {
    vi.doUnmock('node:fs');
    vi.resetModules();
  });

  it('throws at load when no ancestor holds engines/list-routes.mjs beside a package.json', async () => {
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>();
      return {
        ...actual,
        existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
          String(path).endsWith('list-routes.mjs') ? false : actual.existsSync(path),
      };
    });
    await expect(import('../src/checks.js')).rejects.toThrow(
      /^@stynx-nyx\/cli engines directory not found above .*src$/u,
    );
  });
});
