import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PDF_A_ASSET_SHA256 = {
  liberationSansRegular: '76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8',
  liberationSansBold: '788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173',
  liberationMonoRegular: 'f2b83c763e8afd21709333370bed4774337fae82267937e2b5aea7e2fbd922c1',
  srgbIcc: 'b3599c68b79236e5ce69d8dd22178157553631c5fe829130602cde98d8764790',
} as const;

export interface PdfAFontAssetBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  mono: Uint8Array;
}

export function loadPdfAFontAssets(): PdfAFontAssetBytes {
  return {
    regular: readAsset('assets/fonts/LiberationSans-Regular.ttf'),
    bold: readAsset('assets/fonts/LiberationSans-Bold.ttf'),
    mono: readAsset('assets/fonts/LiberationMono-Regular.ttf'),
  };
}

export function loadSrgbIccProfile(): Uint8Array {
  return readAsset('assets/color/sRGB-IEC61966-2.1.icc');
}

function readAsset(relativePath: string): Uint8Array {
  for (const root of assetRootCandidates()) {
    const assetPath = resolve(root, relativePath);
    if (existsSync(assetPath)) {
      return readFileSync(assetPath);
    }
  }
  throw new Error(`Missing @stynx/pdf asset: ${relativePath}`);
}

function assetRootCandidates(): string[] {
  return [
    resolve(__dirname, '..', '..'),
    resolve(__dirname, '..', '..', '..', '..'),
    resolve(process.cwd()),
  ];
}
