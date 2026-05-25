import { sha256CanonicalJson } from './digest';

export type GovBrSandboxState = 'pending' | 'completed' | 'failed';
export type GovBrSandboxDecision = 'approved' | 'denied';

export interface GovBrSandboxSigner {
  sub: string;
  username: string;
  cpf?: string | null | undefined;
  email?: string | null | undefined;
}

export interface GovBrSandboxRequest {
  tenantId: string;
  signer: GovBrSandboxSigner;
  resourceType: string;
  resourceId?: string | null | undefined;
  payload: Record<string, unknown>;
  returnUrl?: string | undefined;
}

export interface GovBrSandboxEvidence {
  uniqueAssociation: true;
  signerControlHighConfidence: true;
  laterModificationDetectable: true;
  creationDataControl: 'sandbox-state-challenge';
}

export interface GovBrSandboxResult {
  id: string;
  state: string;
  challenge: string;
  provider: 'govbr-local-sandbox';
  status: GovBrSandboxState;
  signerUniqueKey: string;
  payloadHash: string;
  signatureHash: string | null;
  tamperEvidentHash: string | null;
  evidenceUri: string | null;
  evidence: GovBrSandboxEvidence | null;
  createdAt: string;
  decidedAt: string | null;
}

interface StoredGovBrRequest extends GovBrSandboxResult {
  request: GovBrSandboxRequest;
}

export class GovBrSandboxAdapter {
  private readonly requests = new Map<string, StoredGovBrRequest>();

  constructor(private readonly now: () => Date = () => new Date(0)) {}

  createRequest(input: GovBrSandboxRequest): GovBrSandboxResult {
    if (!input.resourceType.trim()) throw new Error('resourceType is required');
    const createdAt = this.now().toISOString();
    const signerUniqueKey = sha256CanonicalJson({
      cpf: input.signer.cpf ?? null,
      sub: input.signer.sub,
      tenantId: input.tenantId,
    });
    const payloadHash = sha256CanonicalJson(input.payload);
    const state = sha256CanonicalJson({
      createdAt,
      payloadHash,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType,
      signerUniqueKey,
      tenantId: input.tenantId,
    });
    const challenge = sha256CanonicalJson({ payloadHash, signerUniqueKey, state });
    const id = state.slice(0, 32);
    const record: StoredGovBrRequest = {
      id,
      state,
      challenge,
      provider: 'govbr-local-sandbox',
      status: 'pending',
      signerUniqueKey,
      payloadHash,
      signatureHash: null,
      tamperEvidentHash: null,
      evidenceUri: null,
      evidence: null,
      createdAt,
      decidedAt: null,
      request: input,
    };
    this.requests.set(state, record);
    return toGovBrResult(record);
  }

  complete(state: string, decision: GovBrSandboxDecision, challenge?: string): GovBrSandboxResult {
    const record = this.requests.get(state);
    if (!record) throw new Error('Unknown gov.br signature state');
    if (record.status !== 'pending') throw new Error('Gov.br signature request is already closed');

    const decidedAt = this.now().toISOString();
    record.decidedAt = decidedAt;
    if (decision === 'denied' || challenge !== record.challenge) {
      record.status = 'failed';
      return toGovBrResult(record);
    }

    const signatureHash = sha256CanonicalJson({
      challenge: record.challenge,
      payloadHash: record.payloadHash,
      signerUniqueKey: record.signerUniqueKey,
      signedAt: decidedAt,
      state: record.state,
    });
    const tamperEvidentHash = sha256CanonicalJson({
      payloadHash: record.payloadHash,
      signatureHash,
      signerUniqueKey: record.signerUniqueKey,
      signedAt: decidedAt,
    });
    record.status = 'completed';
    record.signatureHash = signatureHash;
    record.tamperEvidentHash = tamperEvidentHash;
    record.evidenceUri = `govbr-sandbox://advanced-signatures/${record.id}`;
    record.evidence = {
      uniqueAssociation: true,
      signerControlHighConfidence: true,
      laterModificationDetectable: true,
      creationDataControl: 'sandbox-state-challenge',
    };
    return toGovBrResult(record);
  }

  verify(payload: Record<string, unknown>, result: GovBrSandboxResult): boolean {
    if (result.status !== 'completed' || !result.signatureHash || !result.tamperEvidentHash) {
      return false;
    }
    if (sha256CanonicalJson(payload) !== result.payloadHash) return false;
    const signedAt = result.decidedAt;
    if (!signedAt) return false;
    return (
      sha256CanonicalJson({
        payloadHash: result.payloadHash,
        signatureHash: result.signatureHash,
        signerUniqueKey: result.signerUniqueKey,
        signedAt,
      }) === result.tamperEvidentHash
    );
  }
}

export function createGovBrSandboxAdapter(now?: () => Date): GovBrSandboxAdapter {
  return new GovBrSandboxAdapter(now);
}

export function govBrSandboxCallbackUrl(basePath: string, result: GovBrSandboxResult): string {
  const separator = basePath.includes('?') ? '&' : '?';
  return `${basePath}${separator}state=${encodeURIComponent(result.state)}&decision=approved&challenge=${encodeURIComponent(result.challenge)}`;
}

function toGovBrResult(record: StoredGovBrRequest): GovBrSandboxResult {
  return {
    id: record.id,
    state: record.state,
    challenge: record.challenge,
    provider: record.provider,
    status: record.status,
    signerUniqueKey: record.signerUniqueKey,
    payloadHash: record.payloadHash,
    signatureHash: record.signatureHash,
    tamperEvidentHash: record.tamperEvidentHash,
    evidenceUri: record.evidenceUri,
    evidence: record.evidence,
    createdAt: record.createdAt,
    decidedAt: record.decidedAt,
  };
}
