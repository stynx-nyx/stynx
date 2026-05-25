export interface PdfVerificationEvidenceInput {
  payload: Uint8Array;
  verifyUrl: string;
  reason?: string | undefined;
  signedAt?: string | undefined;
  signerName?: string | undefined;
  evidenceUri?: string | undefined;
}

export interface PdfPadesEvidenceRequest {
  payload: Uint8Array;
  verifyUrl: string;
  reason?: string | undefined;
  signedAt?: string | undefined;
  signerName?: string | undefined;
  evidenceUri?: string | undefined;
}

export interface PdfPadesEvidenceResult {
  signedDocument: Uint8Array;
  envelope: unknown;
  block: Uint8Array;
}

export interface PdfPadesEvidenceAdapter {
  sign(input: PdfPadesEvidenceRequest): PdfPadesEvidenceResult;
}

export interface PdfVerificationEvidenceAppenderOptions {
  evidenceAdapter?: PdfPadesEvidenceAdapter | undefined;
  defaultSignerName?: string | undefined;
  now?: (() => Date) | undefined;
}
