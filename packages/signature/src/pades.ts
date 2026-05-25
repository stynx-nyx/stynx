import { sha256, sha256CanonicalJson } from './digest';

export interface PadesEvidenceRequest {
  payload: Uint8Array;
  verifyUrl: string;
  reason?: string | undefined;
  signedAt?: string | undefined;
  signerName?: string | undefined;
  evidenceUri?: string | undefined;
}

export interface PadesEvidenceEnvelope {
  format: 'PAdES';
  profile: 'PAdES-B-B';
  signerName: string;
  signedAt: string;
  reason: string;
  verifyUrl: string;
  payloadSha256: string;
  signatureSha256: string;
  evidenceUri: string;
}

export interface PadesEvidenceResult {
  signedDocument: Uint8Array;
  envelope: PadesEvidenceEnvelope;
  block: Uint8Array;
}

export class MockPadesEvidenceAdapter {
  constructor(private readonly now: () => Date = () => new Date(0)) {}

  sign(input: PadesEvidenceRequest): PadesEvidenceResult {
    const payloadSha256 = sha256(input.payload);
    const signedAt = input.signedAt ?? this.now().toISOString();
    const reason = input.reason ?? 'Official PDF signature';
    const signerName = input.signerName ?? 'STYNX mock PAdES signer';
    const signatureSha256 = sha256CanonicalJson({
      payloadSha256,
      reason,
      signedAt,
      signerName,
      verifyUrl: input.verifyUrl,
    });
    const envelope: PadesEvidenceEnvelope = {
      format: 'PAdES',
      profile: 'PAdES-B-B',
      signerName,
      signedAt,
      reason,
      verifyUrl: input.verifyUrl,
      payloadSha256,
      signatureSha256,
      evidenceUri: input.evidenceUri ?? `stynx-pades://evidence/${signatureSha256}`,
    };
    const block = encodePadesEvidenceBlock(envelope);

    return {
      signedDocument: Buffer.concat([Buffer.from(input.payload), Buffer.from(block)]),
      envelope,
      block,
    };
  }
}

export function createMockPadesEvidenceAdapter(now?: () => Date): MockPadesEvidenceAdapter {
  return new MockPadesEvidenceAdapter(now);
}

export function encodePadesEvidenceBlock(envelope: PadesEvidenceEnvelope): Uint8Array {
  return Buffer.from(
    `\n%%STYNX-PADES-SIGNATURE:${Buffer.from(JSON.stringify(envelope), 'utf8').toString(
      'base64',
    )}\n`,
    'utf8',
  );
}

export function decodePadesEvidenceBlock(document: Uint8Array): PadesEvidenceEnvelope | null {
  const match = Buffer.from(document)
    .toString('latin1')
    .match(/%%STYNX-PADES-SIGNATURE:([A-Za-z0-9+/=]+)/u);
  const encoded = match?.[1];
  if (!encoded) return null;
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as PadesEvidenceEnvelope;
}
