import { createHash } from 'node:crypto';
import {
  loadPdfAFontAssets,
  loadSrgbIccProfile,
  PDF_A_ASSET_SHA256,
} from '../../src/internals/assets';

describe('PDF/A bundled assets', () => {
  it('matches pinned font and ICC hashes', () => {
    const fonts = loadPdfAFontAssets();

    expect(sha256(fonts.regular)).toBe(PDF_A_ASSET_SHA256.liberationSansRegular);
    expect(sha256(fonts.bold)).toBe(PDF_A_ASSET_SHA256.liberationSansBold);
    expect(sha256(fonts.mono)).toBe(PDF_A_ASSET_SHA256.liberationMonoRegular);
    expect(sha256(loadSrgbIccProfile())).toBe(PDF_A_ASSET_SHA256.srgbIcc);
  });
});

function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}
