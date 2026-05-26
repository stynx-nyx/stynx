import fontkit from '@pdf-lib/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';

import { loadPdfAFontAssets } from './assets';

export interface PdfAEmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export async function embedPdfAFonts(pdf: PDFDocument): Promise<PdfAEmbeddedFonts> {
  pdf.registerFontkit(fontkit);
  const assets = loadPdfAFontAssets();
  return {
    regular: await pdf.embedFont(assets.regular, { subset: true }),
    bold: await pdf.embedFont(assets.bold, { subset: true }),
    mono: await pdf.embedFont(assets.mono, { subset: true }),
  };
}
