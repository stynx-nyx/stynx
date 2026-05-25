import { sha256, sha256CanonicalJson } from './digest';

export interface SequentialSignerRef {
  id: string;
  subject: string;
  serial: string;
  role?: string | undefined;
}

export interface SequentialSignatureEntry {
  order: number;
  signer: SequentialSignerRef;
  digest: string;
  signedAt: string;
}

export interface SequentialEnvelope {
  schemaVersion: '1';
  payloadBase64: string;
  payloadSha256: string;
  signatures: SequentialSignatureEntry[];
  expectedSignerIds: string[];
  allowedReaderRoles: string[];
  published: boolean;
}

export interface SequentialVerifyResult {
  ok: boolean;
  order: string[];
  tampered: boolean;
  reasons: string[];
}

export interface SequentialReadResult {
  allowed: boolean;
  payload?: Uint8Array | undefined;
  reasons: string[];
}

export class SequentialSigner {
  constructor(
    private readonly options: {
      expectedSignerIds: string[];
      allowedReaderRoles?: string[] | undefined;
      now?: (() => Date) | undefined;
    },
  ) {}

  create(payload: Uint8Array): SequentialEnvelope {
    return {
      schemaVersion: '1',
      payloadBase64: Buffer.from(payload).toString('base64'),
      payloadSha256: sha256(payload),
      signatures: [],
      expectedSignerIds: this.options.expectedSignerIds,
      allowedReaderRoles: this.options.allowedReaderRoles ?? [],
      published: false,
    };
  }

  append(envelope: SequentialEnvelope, signer: SequentialSignerRef): SequentialEnvelope {
    const nextOrder = envelope.signatures.length + 1;
    const expectedSignerId = envelope.expectedSignerIds[nextOrder - 1];
    if (expectedSignerId && expectedSignerId !== signer.id) {
      throw new Error(`Signer ${signer.id} cannot sign at order ${nextOrder}`);
    }
    const signedAt = (this.options.now ?? (() => new Date(0)))().toISOString();
    const digest = sequentialSignatureDigest(envelope, signer, nextOrder, signedAt);
    return {
      ...envelope,
      signatures: [...envelope.signatures, { order: nextOrder, signer, digest, signedAt }],
    };
  }

  publish(envelope: SequentialEnvelope): SequentialEnvelope {
    if (envelope.signatures.length !== envelope.expectedSignerIds.length) {
      throw new Error('Cannot publish before all expected signers have signed');
    }
    return { ...envelope, published: true };
  }

  verify(envelope: SequentialEnvelope): SequentialVerifyResult {
    return verifySequentialEnvelope(envelope);
  }

  read(envelope: SequentialEnvelope, role: string): SequentialReadResult {
    return readSequentialEnvelope(envelope, role);
  }
}

export function verifySequentialEnvelope(envelope: SequentialEnvelope): SequentialVerifyResult {
  const reasons: string[] = [];
  const payload = Buffer.from(envelope.payloadBase64, 'base64');
  if (sha256(payload) !== envelope.payloadSha256) reasons.push('payload hash mismatch');
  const order = envelope.signatures.map((signature) => signature.signer.id);
  for (const [index, signature] of envelope.signatures.entries()) {
    const expectedOrder = index + 1;
    if (signature.order !== expectedOrder)
      reasons.push(`signature order mismatch at ${expectedOrder}`);
    const expectedSignerId = envelope.expectedSignerIds[index];
    if (expectedSignerId && signature.signer.id !== expectedSignerId) {
      reasons.push(`unexpected signer ${signature.signer.id} at order ${expectedOrder}`);
    }
    const replayEnvelope: SequentialEnvelope = {
      ...envelope,
      signatures: envelope.signatures.slice(0, index),
    };
    const expectedDigest = sequentialSignatureDigest(
      replayEnvelope,
      signature.signer,
      signature.order,
      signature.signedAt,
    );
    if (signature.digest !== expectedDigest) {
      reasons.push(`signature digest mismatch at order ${expectedOrder}`);
    }
  }
  return { ok: reasons.length === 0, order, tampered: reasons.length > 0, reasons };
}

export function readSequentialEnvelope(
  envelope: SequentialEnvelope,
  role: string,
): SequentialReadResult {
  const verified = verifySequentialEnvelope(envelope);
  if (!verified.ok) return { allowed: false, reasons: verified.reasons };
  if (!envelope.published) return { allowed: false, reasons: ['envelope is not published'] };
  if (envelope.allowedReaderRoles.length > 0 && !envelope.allowedReaderRoles.includes(role)) {
    return { allowed: false, reasons: [`role ${role} cannot read envelope`] };
  }
  return {
    allowed: true,
    payload: Buffer.from(envelope.payloadBase64, 'base64'),
    reasons: [],
  };
}

function sequentialSignatureDigest(
  envelope: SequentialEnvelope,
  signer: SequentialSignerRef,
  order: number,
  signedAt: string,
): string {
  return sha256CanonicalJson({
    order,
    payloadSha256: envelope.payloadSha256,
    previousDigest: envelope.signatures.at(-1)?.digest ?? null,
    signedAt,
    signer,
  });
}
