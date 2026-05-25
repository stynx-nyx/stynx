import type { PDFFont, PDFPage } from 'pdf-lib';

export interface FixedLayoutPageSize {
  width: number;
  height: number;
}

export interface FixedLayoutFonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export interface FixedLayoutDrawContext {
  page: PDFPage;
  fonts: FixedLayoutFonts;
  margin: number;
  y: number;
  drawText(text: string, x: number, size?: number, font?: PDFFont): void;
  drawLine(offsetY?: number): void;
  moveY(delta: number): void;
}

export const A4_PAGE_SIZE: FixedLayoutPageSize = {
  width: 595.28,
  height: 841.89,
};
