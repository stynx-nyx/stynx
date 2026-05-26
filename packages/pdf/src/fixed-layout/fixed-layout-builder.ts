import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFDocument as PdfLibDocument, PDFFont, PDFPage } from 'pdf-lib';
import { embedPdfAFonts } from '../internals/pdf-a-fonts';
import { applyPdfAConformanceMetadata } from '../internals/pdf-a-metadata';
import { cleanPdfText } from './text';
import { A4_PAGE_SIZE } from './types';
import type { FixedLayoutDrawContext, FixedLayoutPageSize } from './types';

export interface FixedLayoutDocumentMetadata {
  title: string;
  subject: string;
  author: string;
  creator: string;
  producer?: string;
  createdAt: Date;
  modifiedAt?: Date;
}

export interface FixedLayoutDocumentOptions {
  pageSize?: FixedLayoutPageSize;
  margin?: number;
  initialY?: number;
}

export class FixedLayoutDocumentBuilder {
  private constructor(
    private readonly pdf: PdfLibDocument,
    private readonly metadata: Required<FixedLayoutDocumentMetadata>,
    private readonly options: Required<FixedLayoutDocumentOptions>,
  ) {}

  static async create(
    metadata: FixedLayoutDocumentMetadata,
    options: FixedLayoutDocumentOptions = {},
  ): Promise<FixedLayoutDocumentBuilder> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(metadata.title);
    pdf.setSubject(metadata.subject);
    pdf.setAuthor(metadata.author);
    pdf.setCreator(metadata.creator);
    pdf.setProducer(metadata.producer ?? 'pdf-lib');
    pdf.setCreationDate(metadata.createdAt);
    pdf.setModificationDate(metadata.modifiedAt ?? metadata.createdAt);
    return new FixedLayoutDocumentBuilder(
      pdf,
      {
        ...metadata,
        producer: metadata.producer ?? 'pdf-lib',
        modifiedAt: metadata.modifiedAt ?? metadata.createdAt,
      },
      {
        pageSize: options.pageSize ?? A4_PAGE_SIZE,
        margin: options.margin ?? 36,
        initialY: options.initialY ?? 802,
      },
    );
  }

  async addPage(): Promise<FixedLayoutDrawContext> {
    const page = this.pdf.addPage([this.options.pageSize.width, this.options.pageSize.height]);
    const { regular, bold, mono } = await embedPdfAFonts(this.pdf);
    return createDrawContext(page, {
      regular,
      bold,
      mono,
      margin: this.options.margin,
      initialY: this.options.initialY,
    });
  }

  async save(): Promise<Uint8Array> {
    applyPdfAConformanceMetadata(this.pdf, this.metadata);
    return this.pdf.save({ useObjectStreams: false });
  }
}

function createDrawContext(
  page: PDFPage,
  options: {
    regular: PDFFont;
    bold: PDFFont;
    mono: PDFFont;
    margin: number;
    initialY: number;
  },
): FixedLayoutDrawContext {
  let currentY = options.initialY;
  return {
    page,
    fonts: {
      regular: options.regular,
      bold: options.bold,
      mono: options.mono,
    },
    margin: options.margin,
    get y() {
      return currentY;
    },
    drawText(text: string, x: number, size = 9, font = options.regular): void {
      page.drawText(cleanPdfText(text), {
        x,
        y: currentY,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    },
    drawLine(offsetY = 5): void {
      page.drawLine({
        start: { x: options.margin, y: currentY - offsetY },
        end: { x: 559, y: currentY - offsetY },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      currentY -= 15;
    },
    moveY(delta: number): void {
      currentY -= delta;
    },
  };
}
