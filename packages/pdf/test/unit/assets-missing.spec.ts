import { vi } from 'vitest';

const fsMocks = { existsSync: vi.fn(() => false), readFileSync: vi.fn() };
let loadPdfAFontAssets: typeof import('../../src/internals/assets').loadPdfAFontAssets;

describe('missing PDF/A asset handling', () => {
  beforeAll(async () => {
    vi.resetModules();
    vi.doMock('node:fs', () => fsMocks);
    ({ loadPdfAFontAssets } = await import('../../src/internals/assets'));
  });
  afterAll(() => { vi.doUnmock('node:fs'); vi.resetModules(); });

  it('checks each configured asset root and reports the missing asset clearly', () => {
    expect(() => loadPdfAFontAssets()).toThrow('Missing @stynx-nyx/pdf asset: assets/fonts/LiberationSans-Regular.ttf');
    expect(fsMocks.existsSync).toHaveBeenCalledTimes(3);
    expect(fsMocks.readFileSync).not.toHaveBeenCalled();
  });
});
