import { PDFDocument, rgb } from 'pdf-lib';
import { embedPdfAFonts } from '../internals/pdf-a-fonts.js';
import { applyPdfAConformanceMetadata } from '../internals/pdf-a-metadata.js';
import { appendIncrementalEvidenceObject, copyEvidenceBlock } from '../internals/pdf-incremental-evidence.js';

import type {
  PdfVerificationEvidenceAppenderOptions,
  PdfVerificationEvidenceInput,
} from './types.js';

// A non-literal specifier keeps @stynx-nyx/signature a runtime peer: TypeScript does not
// resolve it, so monorepo tsconfig paths never compile the sibling package source into
// the @stynx-nyx/pdf tarball.
const SIGNATURE_PEER_SPECIFIER: string = '@stynx-nyx/signature';

export class PdfVerificationEvidenceAppender {
  private evidenceAdapter: unknown;

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
        copyEvidenceBlock(this.evidenceBlock(evidenceAdapter, input.payload, input)),
      ]);
    }
  }

  private appendEvidenceBlock(payload: Uint8Array, evidenceBlock: unknown): Uint8Array {
    return appendIncrementalEvidenceObject(payload, evidenceBlock);
  }

  private async resolveEvidenceAdapter(): Promise<unknown> {
    this.evidenceAdapter ??= await createDefaultPadesEvidenceAdapter(this.options.now);
    return this.evidenceAdapter;
  }

  private evidenceBlock(
    evidenceAdapter: unknown,
    payload: Uint8Array,
    input: PdfVerificationEvidenceInput,
  ): unknown {
    const sign = evidenceProperty(evidenceAdapter, 'sign');
    const request = {
      payload,
      verifyUrl: input.verifyUrl,
      reason: input.reason,
      signedAt: input.signedAt,
      signerName: input.signerName ?? this.options.defaultSignerName,
      evidenceUri: input.evidenceUri,
    };
    if (typeof sign !== 'function') throw new TypeError('evidenceAdapter.sign is not a function');
    const signed: unknown = Reflect.apply(sign, evidenceAdapter, [request]);
    return evidenceProperty(signed, 'block');
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
): Promise<unknown> {
  // Keep @stynx-nyx/signature as a runtime peer so @stynx-nyx/pdf does not compile the
  // sibling package source into its tarball through monorepo tsconfig paths.
  const signature: unknown = await import(SIGNATURE_PEER_SPECIFIER);
  const factory = evidenceProperty(signature, 'createMockPadesEvidenceAdapter');
  if (typeof factory !== 'function') {
    throw new TypeError('signature.createMockPadesEvidenceAdapter is not a function');
  }
  const adapter: unknown = Reflect.apply(factory, signature, [now]);
  return adapter;
}

function evidenceProperty(
  value: unknown,
  key: 'sign' | 'block' | 'createMockPadesEvidenceAdapter',
): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  const target: unknown = Object(value);
  if ((typeof target !== 'object' || target === null) && typeof target !== 'function') {
    throw new TypeError('Expected native boxed evidence value');
  }
  const property: unknown = Reflect.get(target, key, value);
  return property;
}
