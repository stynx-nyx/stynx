import { sha256Hex } from './signature.service';
import { SignatureTrustError } from './errors';
import { SignatureTrustUnavailableError, SignatureProviderConfigurationError } from './errors';
import { isCmsTrustVerifier } from './cms-trust-verifier';
import type { SignatureCertificateRef, SignatureTrustProfile, SignatureTrustVerifier } from './types';

export function canonicalRfc8785Json(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || value === null || value instanceof Date ||
      value instanceof Uint8Array) throw new SignatureTrustError('Manifest contains a non-JSON value');
  if (seen.has(value)) throw new SignatureTrustError('Manifest contains a cycle');
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new SignatureTrustError('Sparse array');
    const encoded = `[${value.map(x => canonicalRfc8785Json(x, seen)).join(',')}]`;
    seen.delete(value);
    return encoded;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new SignatureTrustError('Unsupported JSON object');
  const entries = Object.keys(value).sort().map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value,key);
    if (!descriptor || !('value' in descriptor)) throw new SignatureTrustError('Accessor in manifest');
    return `${JSON.stringify(key)}:${canonicalRfc8785Json(descriptor.value,seen)}`;
  });
  seen.delete(value);
  return `{${entries.join(',')}}`;
}
const hash = (value: unknown): string => sha256Hex(Buffer.from(canonicalRfc8785Json(value),'utf8'));
const instant = (date: Date): string => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getTime() <= 0)
    throw new SignatureTrustError('Real UTC instant required');
  return date.toISOString();
};
const isInstant = (value: unknown): boolean => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value) &&
  Date.parse(value) > 0;

export interface ManifestPreparation {
  tenantId:string; aggregateId:string; documentId:string; documentKind:string;
  document:Uint8Array; documentSha256:string; snapshot:Uint8Array; snapshotSha256:string;
  requiredSignerIds:readonly string[]; preparedAt:Date;
}
export interface ManifestSignerArtifact {
  signerId:string; signatureId:string; signedDocument:Uint8Array; cmsSignature:Uint8Array;
  certificate:SignatureCertificateRef; trustProfile:SignatureTrustProfile;
}
export interface ManifestSignerEntry {
  verifierKind:'stynx-cms'|'consumer-owned';
  expectedSignerCertificateSha256:string;
  order:number; signerId:string; signatureId:string; signedAt:string; tsaAt:string;
  signedDocumentSha256:string; cmsSha256:string; signerCertificateSha256:string;
  chainSha256:readonly string[]; padesProfile:string; achievedLevel:string;
  verificationRef:string; profileRevision:string; previousEntryHash:string;
  manifestSha256:string; entryHash:string;
}
export interface SignatureManifest {
  manifestVersion:'1'; canonicalization:'RFC8785-JCS'; kind:'session-minutes'|'batch-minutes';
  tenantId:string; aggregateId:string; documentId:string; documentKind:string;
  documentSha256:string; snapshotSha256:string; requiredSignerIds:readonly string[];
  preparedAt:string; sessionId?:string;minutesId?:string;batchId?:string;
  signers:ManifestSignerEntry[]; manifestSha256:string; sealSha256?:string;
}

export class SignatureManifestService {
  constructor(private readonly options:{verifier?:SignatureTrustVerifier;trustVerifier?:SignatureTrustVerifier;
    consumerOwnedVerifier?:{acknowledged:true};
    resolveSignerCertificate?:(tenantId:string,signerId:string)=>Promise<string>}) {}
  private get verifier():SignatureTrustVerifier {
    const verifier = this.options.trustVerifier ?? this.options.verifier;
    if (!verifier) throw new SignatureTrustError('Trust verifier required');
    return verifier;
  }
  private kind(profile:SignatureTrustProfile):'stynx-cms'|'consumer-owned' {
    const branded=isCmsTrustVerifier(this.verifier);
    if (profile.environment === 'production' && !branded && !this.options.consumerOwnedVerifier?.acknowledged)
      throw new SignatureProviderConfigurationError('Production trust verifier is unacknowledged');
    return branded ? 'stynx-cms':'consumer-owned';
  }
  private async expectedCertificate(manifest:SignatureManifest,signerId:string):Promise<string> {
    if (!this.options.resolveSignerCertificate)
      throw new SignatureProviderConfigurationError('Signer certificate resolver required');
    let expected:string;
    try {expected=await this.options.resolveSignerCertificate(manifest.tenantId,signerId);}
    catch {throw new SignatureTrustUnavailableError('Signer certificate resolver unavailable');}
    if (!/^[0-9a-f]{64}$/u.test(expected))
      throw new SignatureTrustUnavailableError('Signer certificate resolution unavailable');
    return expected;
  }
  prepareSession(input:ManifestPreparation & {sessionId:string;minutesId:string}):SignatureManifest {
    return this.prepare(input,'session-minutes',{sessionId:input.sessionId,minutesId:input.minutesId});
  }
  prepareBatch(input:ManifestPreparation & {batchId:string}):SignatureManifest {
    return this.prepare(input,'batch-minutes',{batchId:input.batchId});
  }
  private prepare(input:ManifestPreparation,kind:SignatureManifest['kind'],ids:object):SignatureManifest {
    if (sha256Hex(input.document) !== input.documentSha256 || sha256Hex(input.snapshot) !== input.snapshotSha256)
      throw new SignatureTrustError('Document or snapshot hash differs');
    if (!input.requiredSignerIds.length || new Set(input.requiredSignerIds).size !== input.requiredSignerIds.length)
      throw new SignatureTrustError('Required signers are absent or duplicated');
    const base = {manifestVersion:'1' as const,canonicalization:'RFC8785-JCS' as const,kind,
      tenantId:input.tenantId,aggregateId:input.aggregateId,documentId:input.documentId,
      documentKind:input.documentKind,documentSha256:input.documentSha256,
      snapshotSha256:input.snapshotSha256,requiredSignerIds:[...input.requiredSignerIds],
      preparedAt:instant(input.preparedAt),...ids,signers:[] as ManifestSignerEntry[]};
    canonicalRfc8785Json(base);
    return {...base,manifestSha256:hash(base)};
  }
  async appendVerifiedSigner(manifest:SignatureManifest,artifact:ManifestSignerArtifact,
    bindings:{sourceDocument:Uint8Array;snapshot:Uint8Array}):Promise<SignatureManifest> {
    if (!bindings?.sourceDocument || !bindings.snapshot)
      throw new SignatureTrustError('Source document and snapshot required');
    const {manifestSha256,signers,sealSha256,...base}=manifest;
    if (manifest.manifestVersion !== '1' || manifest.canonicalization !== 'RFC8785-JCS' ||
      hash({...base,signers:[]}) !== manifestSha256 ||
      sha256Hex(bindings.sourceDocument) !== manifest.documentSha256 ||
      sha256Hex(bindings.snapshot) !== manifest.snapshotSha256 ||
      signers.length >= manifest.requiredSignerIds.length || sealSha256)
      throw new SignatureTrustError('Manifest binding differs');
    if (artifact.signerId !== manifest.requiredSignerIds[manifest.signers.length])
      throw new SignatureTrustError('Signer order differs');
    const expectedSignerCertificateSha256=await this.expectedCertificate(manifest,artifact.signerId);
    const verifierKind=this.kind(artifact.trustProfile);
    const proof = await this.verifier.verifySignedArtifact({tenantId:manifest.tenantId,
      originalDocument:bindings.sourceDocument,
      signedDocument:artifact.signedDocument,cmsSignature:artifact.cmsSignature,
      certificate:artifact.certificate,profile:artifact.trustProfile,
      expectedManifestSha256:manifest.manifestSha256});
    if (proof.boundManifestSha256 !== manifest.manifestSha256)
      throw new SignatureTrustError('CMS signed manifest binding differs');
    if (proof.originalDocumentSha256 !== manifest.documentSha256 ||
      proof.signedDocumentSha256 !== sha256Hex(artifact.signedDocument) ||
      proof.cmsSha256 !== sha256Hex(artifact.cmsSignature) ||
      proof.profileId !== artifact.trustProfile.id ||
      proof.profileRevision !== artifact.trustProfile.revision ||
      proof.signerCertificateSha256 !== (artifact.certificate.pem ?
        sha256Hex(Buffer.from(artifact.certificate.pem.replace(/-----[^-]+-----|\s/gu,''),'base64')) : '') ||
      (artifact.trustProfile.minimumSignatureLevel === 'QUALIFIED' && proof.achievedLevel !== 'QUALIFIED'))
      throw new SignatureTrustError('Signer trust proof differs from artifact');
    if (proof.signerCertificateSha256 !== expectedSignerCertificateSha256 ||
      manifest.signers.some(entry=>entry.cmsSha256 === proof.cmsSha256 ||
        entry.signatureId === artifact.signatureId ||
        entry.signerCertificateSha256 === proof.signerCertificateSha256))
      throw new SignatureTrustError('Signer identity or duplicate evidence differs');
    const entry = {verifierKind,expectedSignerCertificateSha256,
      order:manifest.signers.length+1,signerId:artifact.signerId,
      signatureId:artifact.signatureId,signedAt:instant(proof.signedAt),tsaAt:instant(proof.tsaAt),
      signedDocumentSha256:sha256Hex(artifact.signedDocument),cmsSha256:sha256Hex(artifact.cmsSignature),
      signerCertificateSha256:proof.signerCertificateSha256,chainSha256:[...proof.chainSha256],
      padesProfile:proof.padesProfile,achievedLevel:proof.achievedLevel,
      verificationRef:proof.verificationRef,profileRevision:proof.profileRevision,
      previousEntryHash:manifest.signers.at(-1)?.entryHash ?? manifest.manifestSha256,
      manifestSha256:manifest.manifestSha256};
    const next = [...manifest.signers,{...entry,entryHash:hash(entry)}];
    return {...manifest,signers:next,...(next.length === manifest.requiredSignerIds.length ?
      {sealSha256:hash({manifestSha256:manifest.manifestSha256,entryHashes:next.map(e=>e.entryHash)})}:{})};
  }
  async verifyManifest(input:{manifest:SignatureManifest;sourceDocument:Uint8Array;snapshot:Uint8Array;
    signers:readonly ManifestSignerArtifact[]}):Promise<{status:'valid'|'tampered'|'untrusted'|'unavailable';reasons:string[]}> {
    try {
      const manifest = input.manifest;
      const {manifestSha256,signers,sealSha256,...base} = manifest;
      if (manifest.manifestVersion !== '1' || manifest.canonicalization !== 'RFC8785-JCS' ||
        !isInstant(manifest.preparedAt) || hash({...base,signers:[]}) !== manifestSha256 ||
        sha256Hex(input.sourceDocument) !== manifest.documentSha256 ||
        sha256Hex(input.snapshot) !== manifest.snapshotSha256 ||
        signers.length !== manifest.requiredSignerIds.length ||
        input.signers.length !== signers.length ||
        new Set(manifest.requiredSignerIds).size !== manifest.requiredSignerIds.length)
        return {status:'tampered',reasons:['MANIFEST_BINDING']};
      let previous = manifestSha256;
      for (let i=0;i<signers.length;i++) {
        const entry=signers[i]!; const artifact=input.signers[i]!;
        const {entryHash,...fields}=entry;
        if (entry.order !== i+1 || entry.signerId !== manifest.requiredSignerIds[i] ||
          artifact.signerId !== entry.signerId || entry.previousEntryHash !== previous ||
          entry.manifestSha256 !== manifestSha256 || !isInstant(entry.signedAt) ||
          !isInstant(entry.tsaAt) || hash(fields) !== entryHash ||
          entry.signedDocumentSha256 !== sha256Hex(artifact.signedDocument) ||
          entry.cmsSha256 !== sha256Hex(artifact.cmsSignature))
          return {status:'tampered',reasons:['SIGNER_BINDING']};
        const verifierKind=this.kind(artifact.trustProfile);
        if (entry.verifierKind !== verifierKind)
          return {status:'tampered',reasons:['VERIFIER_KIND_BINDING']};
        const expected=await this.expectedCertificate(manifest,entry.signerId);
        if (entry.expectedSignerCertificateSha256 !== expected ||
          signers.slice(0,i).some(previousEntry=>previousEntry.cmsSha256 === entry.cmsSha256 ||
            previousEntry.signatureId === entry.signatureId ||
            previousEntry.signerCertificateSha256 === entry.signerCertificateSha256))
          return {status:'tampered',reasons:['SIGNER_IDENTITY_BINDING']};
        const proof=await this.verifier.verifySignedArtifact({tenantId:manifest.tenantId,
          originalDocument:input.sourceDocument,signedDocument:artifact.signedDocument,
          cmsSignature:artifact.cmsSignature,certificate:artifact.certificate,
          profile:artifact.trustProfile,expectedManifestSha256:manifestSha256});
        if (proof.boundManifestSha256 !== manifestSha256 ||
          proof.signerCertificateSha256 !== entry.signerCertificateSha256 ||
          proof.signerCertificateSha256 !== expected ||
          proof.profileRevision !== entry.profileRevision ||
          proof.achievedLevel !== entry.achievedLevel ||
          proof.padesProfile !== entry.padesProfile ||
          proof.verificationRef !== entry.verificationRef ||
          instant(proof.tsaAt) !== entry.tsaAt)
          return {status:'untrusted',reasons:['SIGNER_PROOF']};
        previous=entryHash;
      }
      if (sealSha256 !== hash({manifestSha256,entryHashes:signers.map(e=>e.entryHash)}))
        return {status:'tampered',reasons:['SEAL_BINDING']};
      return {status:'valid',reasons:[]};
    } catch (error) {
      if (error instanceof SignatureProviderConfigurationError) throw error;
      return error instanceof SignatureTrustUnavailableError ?
      {status:'unavailable',reasons:['TRUST_EVIDENCE_UNAVAILABLE']} :
      {status:'untrusted',reasons:['TRUST_PROOF_FAILED']}; }
  }
}
