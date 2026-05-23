import { createHash } from 'node:crypto';
import {
  SignatureHashMismatchError,
  SignatureProviderConfigurationError,
  SignatureVerificationInputError,
} from './errors';
import type {
  SignatureBackend,
  SignatureRequest,
  SignatureResult,
  VerifyRequest,
  VerifyResult,
} from './types';

class MissingSignatureBackend implements SignatureBackend {
  async sign(): Promise<SignatureResult> {
    throw new SignatureProviderConfigurationError();
  }

  async verify(): Promise<VerifyResult> {
    throw new SignatureProviderConfigurationError();
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDocumentHash(document: Uint8Array, expectedSha256: string): void {
  const actual = sha256Hex(document);
  if (actual !== expectedSha256) {
    throw new SignatureHashMismatchError(expectedSha256, actual);
  }
}

export class SignatureService {
  constructor(private readonly backend: SignatureBackend = new MissingSignatureBackend()) {}

  async sign(request: SignatureRequest): Promise<SignatureResult> {
    assertDocumentHash(request.document, request.documentSha256);
    return this.backend.sign({
      ...request,
      algorithm: request.algorithm ?? 'pades-ltv',
      digestAlgorithm: request.digestAlgorithm ?? 'sha256',
    });
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    assertDocumentHash(request.document, request.documentSha256);
    if (!request.signedDocument && !request.cmsSignature) {
      throw new SignatureVerificationInputError();
    }
    return this.backend.verify(request);
  }
}
