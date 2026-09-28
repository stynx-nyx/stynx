import * as asn1js from 'asn1js';
import { timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './signature.service';
import { canonicalRfc8785Json } from './manifest';
import { SignatureTrustUnavailableError, SignatureProviderConfigurationError } from './errors';
import { isCmsTrustVerifier } from './cms-trust-verifier';
import { readWithdrawalSourceBinding } from './pdf-trust-evidence';
import type { SignatureCertificateRef, SignatureTrustProfile, SignatureTrustVerifier } from './types';

export interface WithdrawalVerificationInput {
  tenantId:string;caseId:string;documentId:string;document:Uint8Array;contentHash:string;
  eligiblePartyIds:readonly string[];evidenceBytes:Uint8Array;evidenceRef:string;
  trustProfile:SignatureTrustProfile;verificationMethod:'physical_verified'|'digital_verified';
  signerPartyId:string;signedDocument?:Uint8Array;cmsSignature?:Uint8Array;
  certificate?:SignatureCertificateRef;
  declarationDocument?:Uint8Array;declarationSignedDocument?:Uint8Array;
  declarationCmsSignature?:Uint8Array;declarationCertificate?:SignatureCertificateRef;
}
export interface VerifiedWithdrawalEvidence {
  verifierKind?:'stynx-cms'|'consumer-owned';
  tenantId:string;caseId:string;documentId:string;contentHash:string;signerPartyId:string;
  verificationMethod:'physical_verified'|'digital_verified';evidenceRef:string;verifiedAt:Date;
  proofRef:string;verifiedHashes:{documentSha256:string;evidenceSha256:string};
}
export type WithdrawalVerificationResult =
  {status:'valid';evidence:VerifiedWithdrawalEvidence} |
  {status:'tampered'|'ineligible'|'untrusted'|'unavailable';reasons:string[]};

export class SignatureWithdrawalVerifier {
  constructor(private readonly options:{
    attestor?:{verifyAttestation(input:WithdrawalVerificationInput):Promise<Partial<VerifiedWithdrawalEvidence>>};
    trustVerifier?:SignatureTrustVerifier;
    resolvePartyCertificate?: (tenantId:string,signerPartyId:string) => Promise<string>;
    consumerOwnedVerifier?:{acknowledged:true};
  }) {}
  async verifyWithdrawalEvidence(input:WithdrawalVerificationInput):Promise<WithdrawalVerificationResult> {
    const refuse = (status:'tampered'|'ineligible'|'untrusted'|'unavailable',reason:string):WithdrawalVerificationResult =>
      ({status,reasons:[reason]});
    if (!input.tenantId || !input.caseId || !input.documentId ||
      input.contentHash !== sha256Hex(input.document)) return refuse('tampered','DOCUMENT_BINDING');
    if (!input.eligiblePartyIds.includes(input.signerPartyId)) return refuse('ineligible','PARTY_INELIGIBLE');
    if (!input.evidenceRef || !input.evidenceBytes?.length) return refuse('unavailable','EVIDENCE_ABSENT');
    const parsed = asn1js.fromBER(input.evidenceBytes.buffer.slice(
      input.evidenceBytes.byteOffset,input.evidenceBytes.byteOffset+input.evidenceBytes.byteLength) as ArrayBuffer);
    if (parsed.offset !== input.evidenceBytes.length) return refuse('untrusted','EVIDENCE_NOT_SIGNED');
    let verifiedAt:Date;let proofRef:string;
    if (input.verificationMethod === 'physical_verified') {
      if (!this.options.attestor) return refuse('unavailable','ATTESTOR_UNAVAILABLE');
      let record:Partial<VerifiedWithdrawalEvidence>;
      try {record=await this.options.attestor.verifyAttestation(input);}
      catch {return refuse('unavailable','ATTESTOR_UNAVAILABLE');}
      for (const key of ['tenantId','caseId','documentId','contentHash','signerPartyId','evidenceRef','verificationMethod'] as const) {
        if (record[key] !== input[key]) return refuse('tampered','ATTESTATION_BINDING');
      }
      if (!record.proofRef || !(record.verifiedAt instanceof Date) || record.verifiedAt.getTime() <= 0)
        return refuse('untrusted','ATTESTATION_PROOF');
      verifiedAt=record.verifiedAt;proofRef=record.proofRef;
    } else {
      if (!this.options.trustVerifier || !input.declarationDocument?.length ||
        !input.declarationSignedDocument?.length || !input.declarationCmsSignature?.length ||
        !input.declarationCertificate || !this.options.resolvePartyCertificate)
        return refuse('unavailable','DIGITAL_PROOF_ABSENT');
      const branded=isCmsTrustVerifier(this.options.trustVerifier);
      if (input.trustProfile.environment === 'production' && !branded &&
        !this.options.consumerOwnedVerifier?.acknowledged)
        throw new SignatureProviderConfigurationError('Production trust verifier is unacknowledged');
      if (input.evidenceBytes.length !== input.declarationCmsSignature.length ||
        !timingSafeEqual(Buffer.from(input.evidenceBytes),Buffer.from(input.declarationCmsSignature)))
        return refuse('tampered','EVIDENCE_CMS_BINDING');
      if ((input.cmsSignature && Buffer.from(input.cmsSignature).equals(Buffer.from(input.declarationCmsSignature))) ||
        (input.signedDocument && Buffer.from(input.signedDocument).equals(Buffer.from(input.declarationSignedDocument))))
        return refuse('tampered','DOCUMENT_SIGNATURE_REUSED');
      const declaration={tenantId:input.tenantId,caseId:input.caseId,documentId:input.documentId,
        contentHash:input.contentHash,signerPartyId:input.signerPartyId,evidenceRef:input.evidenceRef};
      const declarationHash=sha256Hex(Buffer.from(canonicalRfc8785Json(declaration),'utf8'));
      const declarationPdf=Buffer.from(input.declarationDocument);
      let sourceBinding:string|undefined;
      try {sourceBinding=await readWithdrawalSourceBinding(declarationPdf);}
      catch {return refuse('tampered','WITHDRAWAL_DECLARATION_BINDING');}
      if (sourceBinding !== declarationHash)
        return refuse('tampered','WITHDRAWAL_DECLARATION_BINDING');
      const signedPdf=Buffer.from(input.declarationSignedDocument);
      const cmsHex=Buffer.from(input.declarationCmsSignature).toString('hex');
      const selected=[...signedPdf.toString('latin1').matchAll(/\/ByteRange\s*\[\s*\d+\s+(\d+)\s+(\d+)\s+\d+\s*\]/gu)]
        .filter(range=>signedPdf.subarray(Number(range[1]),Number(range[2])).toString('latin1')
          .toLowerCase().startsWith(`<${cmsHex}`));
      if (selected.length !== 1 || declarationPdf.length > Number(selected[0]![1]) ||
        !signedPdf.subarray(0,declarationPdf.length).equals(declarationPdf))
        return refuse('tampered','WITHDRAWAL_DECLARATION_SOURCE');
      let expectedCertificateSha256:string;
      try {expectedCertificateSha256=await this.options.resolvePartyCertificate(input.tenantId,input.signerPartyId);}
      catch {return refuse('unavailable','PARTY_CERTIFICATE_UNAVAILABLE');}
      if (!/^[0-9a-f]{64}$/u.test(expectedCertificateSha256))
        return refuse('unavailable','PARTY_CERTIFICATE_UNAVAILABLE');
      try {
        const proof=await this.options.trustVerifier.verifySignedArtifact({tenantId:input.tenantId,
          originalDocument:input.declarationDocument,signedDocument:input.declarationSignedDocument,
          cmsSignature:input.declarationCmsSignature,certificate:input.declarationCertificate,profile:input.trustProfile});
        if (proof.originalDocumentSha256 !== sha256Hex(input.declarationDocument) ||
          proof.signedDocumentSha256 !== sha256Hex(input.declarationSignedDocument) ||
          proof.cmsSha256 !== sha256Hex(input.declarationCmsSignature) ||
          proof.signerCertificateSha256 !== expectedCertificateSha256 ||
          (input.trustProfile.minimumSignatureLevel === 'QUALIFIED' && proof.achievedLevel !== 'QUALIFIED'))
          return refuse('tampered','DIGITAL_PROOF_BINDING');
        verifiedAt=proof.tsaAt;proofRef=proof.verificationRef;
      } catch (error) {return error instanceof SignatureTrustUnavailableError ?
        refuse('unavailable','DIGITAL_TRUST_UNAVAILABLE') : refuse('tampered','DIGITAL_SIGNATURE_INVALID');}
    }
    return {status:'valid',evidence:{...(input.verificationMethod === 'digital_verified' ?
      {verifierKind:isCmsTrustVerifier(this.options.trustVerifier!) ? 'stynx-cms' as const : 'consumer-owned' as const}:{}),
      tenantId:input.tenantId,caseId:input.caseId,
      documentId:input.documentId,contentHash:input.contentHash,signerPartyId:input.signerPartyId,
      verificationMethod:input.verificationMethod,evidenceRef:input.evidenceRef,
      verifiedAt,proofRef,verifiedHashes:{documentSha256:input.contentHash,
        evidenceSha256:sha256Hex(input.evidenceBytes)}}};
  }
}
