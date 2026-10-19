import { PDFDocument, rgb } from 'pdf-lib';
import { embedPdfAFonts } from '../internals/pdf-a-fonts.js';
import { applyPdfAConformanceMetadata } from '../internals/pdf-a-metadata.js';
import { appendIncrementalEvidenceObject } from '../internals/pdf-incremental-evidence.js';

import type {
  PdfPadesEvidenceAdapter,
  PdfVerificationEvidenceAppenderOptions,
  PdfVerificationEvidenceInput,
} from './types.js';

// A non-literal specifier keeps @stynx-nyx/signature a runtime peer: TypeScript does not
// resolve it, so monorepo tsconfig paths never compile the sibling package source into
// the @stynx-nyx/pdf tarball.
const SIGNATURE_PEER_SPECIFIER: string = '@stynx-nyx/signature';

export class PdfVerificationEvidenceAppender {
  private evidenceAdapter: PdfPadesEvidenceAdapter | undefined;

  constructor(private readonly options: PdfVerificationEvidenceAppenderOptions = {}) {
    this.evidenceAdapter = options.evidenceAdapter;
  }

  async embedVerificationHint(input: PdfVerificationEvidenceInput): Promise<Uint8Array> {
    const evidenceAdapter = await this.resolveEvidenceAdapter();
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
      const evidenceBlock = this.evidenceBlock(evidenceAdapter, rendered, input);
      return this.appendEvidenceBlock(rendered, evidenceBlock);
    } catch {
      return Buffer.concat([
        Buffer.from(input.payload),
        Buffer.from(`\n%%STYNX-PDF-VERIFY:${input.verifyUrl}\n`, 'utf8'),
        Buffer.from(this.evidenceBlock(evidenceAdapter, input.payload, input)),
      ]);
    }
  }

  private appendEvidenceBlock(payload: Uint8Array, evidenceBlock: Uint8Array): Uint8Array {
    return appendIncrementalEvidenceObject(payload, evidenceBlock);
  }

  private async resolveEvidenceAdapter(): Promise<PdfPadesEvidenceAdapter> {
    this.evidenceAdapter ??= await createDefaultPadesEvidenceAdapter(this.options.now);
    return this.evidenceAdapter;
  }

  private evidenceBlock(
    evidenceAdapter: PdfPadesEvidenceAdapter,
    payload: Uint8Array,
    input: PdfVerificationEvidenceInput,
  ): Uint8Array {
    const signed = evidenceAdapter.sign({
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

async function createDefaultPadesEvidenceAdapter(
  now: (() => Date) | undefined,
): Promise<PdfPadesEvidenceAdapter> {
  // Keep @stynx-nyx/signature as a runtime peer so @stynx-nyx/pdf does not compile the
  // sibling package source into its tarball through monorepo tsconfig paths.
  const signature = (await import(SIGNATURE_PEER_SPECIFIER)) as {
    createMockPadesEvidenceAdapter: (now?: () => Date) => PdfPadesEvidenceAdapter;
  };
  return signature.createMockPadesEvidenceAdapter(now);
}
