import { createRequire } from 'node:module';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedPdfAFonts } from '../internals/pdf-a-fonts';
import { applyPdfAConformanceMetadata } from '../internals/pdf-a-metadata';
import { appendIncrementalEvidenceObject } from '../internals/pdf-incremental-evidence';

import type {
  PdfPadesEvidenceAdapter,
  PdfVerificationEvidenceAppenderOptions,
  PdfVerificationEvidenceInput,
} from './types';

const loadPeerPackage = createRequire(__filename);

export class PdfVerificationEvidenceAppender {
  private readonly evidenceAdapter: PdfPadesEvidenceAdapter;

  constructor(private readonly options: PdfVerificationEvidenceAppenderOptions = {}) {
    this.evidenceAdapter =
      options.evidenceAdapter ?? createDefaultPadesEvidenceAdapter(options.now);
  }

  async embedVerificationHint(input: PdfVerificationEvidenceInput): Promise<Uint8Array> {
    try {
      const pdf = await PDFDocument.load(input.payload, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      const page = pdf.getPage(pdf.getPageCount() - 1);
      const { regular: font } = await embedPdfAFonts(pdf);
      page.drawText(`Verificacao publica: ${input.verifyUrl}`, {
        x: 36,
        y: 36,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      applyPdfAConformanceMetadata(pdf, metadataFromInput(input));
      const rendered = await pdf.save({ useObjectStreams: false });
      const evidenceBlock = this.evidenceBlock(rendered, input);
      return this.appendEvidenceBlock(rendered, evidenceBlock);
    } catch {
      return Buffer.concat([
        Buffer.from(input.payload),
        Buffer.from(`\n%%STYNX-PDF-VERIFY:${input.verifyUrl}\n`, 'utf8'),
        Buffer.from(this.evidenceBlock(input.payload, input)),
      ]);
    }
  }

  private appendEvidenceBlock(payload: Uint8Array, evidenceBlock: Uint8Array): Uint8Array {
    return appendIncrementalEvidenceObject(payload, evidenceBlock);
  }

  private evidenceBlock(payload: Uint8Array, input: PdfVerificationEvidenceInput): Uint8Array {
    const signed = this.evidenceAdapter.sign({
      payload,
      verifyUrl: input.verifyUrl,
      reason: input.reason,
      signedAt: input.signedAt,
      signerName: input.signerName ?? this.options.defaultSignerName,
      evidenceUri: input.evidenceUri,
    });
    return signed.block;
  }
}

function metadataFromInput(input: PdfVerificationEvidenceInput) {
  const signedAt = parseDate(input.signedAt) ?? new Date(0);
  return {
    title: 'STYNX PDF verification evidence',
    subject: input.reason ?? 'Official PDF signature evidence',
    author: input.signerName ?? 'STYNX',
    creator: 'PdfVerificationEvidenceAppender',
    producer: 'pdf-lib',
    createdAt: signedAt,
    modifiedAt: signedAt,
  };
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function createDefaultPadesEvidenceAdapter(now: (() => Date) | undefined): PdfPadesEvidenceAdapter {
  // Keep @stynx/signature as a runtime peer so @stynx/pdf does not compile the
  // sibling package source into its tarball through monorepo tsconfig paths.
  const signature = loadPeerPackage('@stynx/signature') as {
    createMockPadesEvidenceAdapter: (now?: () => Date) => PdfPadesEvidenceAdapter;
  };
  return signature.createMockPadesEvidenceAdapter(now);
}
