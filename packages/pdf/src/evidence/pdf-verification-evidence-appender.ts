import { createRequire } from 'node:module';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type {
  PdfPadesEvidenceAdapter,
  PdfVerificationEvidenceAppenderOptions,
  PdfVerificationEvidenceInput,
} from './types';

const loadPeerPackage = createRequire(__filename);

export class PdfVerificationEvidenceAppender {
  private readonly evidenceAdapter: PdfPadesEvidenceAdapter;

  constructor(
    private readonly options: PdfVerificationEvidenceAppenderOptions = {},
  ) {
    this.evidenceAdapter =
      options.evidenceAdapter ?? createDefaultPadesEvidenceAdapter(options.now);
  }

  async embedVerificationHint(
    input: PdfVerificationEvidenceInput,
  ): Promise<Uint8Array> {
    try {
      const pdf = await PDFDocument.load(input.payload, {
        ignoreEncryption: true,
        updateMetadata: false,
      });
      const page = pdf.getPage(pdf.getPageCount() - 1);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(`Verificacao publica: ${input.verifyUrl}`, {
        x: 36,
        y: 36,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      const rendered = await pdf.save({ useObjectStreams: false });
      return this.appendEvidenceBlock(rendered, input);
    } catch {
      return Buffer.concat([
        Buffer.from(input.payload),
        Buffer.from(`\n%%STYNX-PDF-VERIFY:${input.verifyUrl}\n`, 'utf8'),
        Buffer.from(this.evidenceBlock(input.payload, input)),
      ]);
    }
  }

  private appendEvidenceBlock(
    payload: Uint8Array,
    input: PdfVerificationEvidenceInput,
  ): Uint8Array {
    return Buffer.concat([
      Buffer.from(payload),
      Buffer.from(this.evidenceBlock(payload, input)),
    ]);
  }

  private evidenceBlock(
    payload: Uint8Array,
    input: PdfVerificationEvidenceInput,
  ): Uint8Array {
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

function createDefaultPadesEvidenceAdapter(
  now: (() => Date) | undefined,
): PdfPadesEvidenceAdapter {
  // Keep @stynx/signature as a runtime peer so @stynx/pdf does not compile the
  // sibling package source into its tarball through monorepo tsconfig paths.
  const signature = loadPeerPackage('@stynx/signature') as {
    createMockPadesEvidenceAdapter: (
      now?: () => Date,
    ) => PdfPadesEvidenceAdapter;
  };
  return signature.createMockPadesEvidenceAdapter(now);
}
