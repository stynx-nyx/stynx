import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { X509Certificate } from '@peculiar/x509';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { SignatureTrustError, SignatureTrustUnavailableError, SignatureCapabilityError, SignatureEvidenceMismatchError } from './errors';
import { sha256 as sha256Hex } from './digest';
import { readPdfTrustEvidence, readSelectedSignatureDictionary } from './pdf-trust-evidence';
import type { SignatureQualificationRule, SignatureTrustVerifier, SignatureTrustProof } from './types';

const branded = new WeakSet<object>();
export function isCmsTrustVerifier(value: object): boolean { return branded.has(value); }
const der = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const parse = (bytes: Uint8Array) => {
  const parsed = asn1js.fromBER(der(bytes));
  if (parsed.offset !== bytes.length) throw new SignatureTrustError('Invalid ASN.1 evidence');
  return parsed.result;
};
const pemDer = (pem: string): Buffer => Buffer.from(pem.replace(/-----[^-]+-----|\s/gu, ''), 'base64');
const cert = (pem: string): pkijs.Certificate => new pkijs.Certificate({ schema: parse(pemDer(pem)) });
const content = (bytes: Uint8Array): pkijs.SignedData => {
  const info = new pkijs.ContentInfo({ schema: parse(bytes) });
  if (info.contentType !== pkijs.ContentInfo.SIGNED_DATA) throw new SignatureTrustError('CMS SignedData required');
  return new pkijs.SignedData({ schema: info.content });
};
const hasPolicy = (certificate: pkijs.Certificate, oids: readonly string[]): boolean => {
  const policies = certificate.extensions?.find(ext => ext.extnID === '2.5.29.32')?.parsedValue;
  return policies instanceof pkijs.CertificatePolicies &&
    policies.certificatePolicies.some(p => oids.includes(p.policyIdentifier));
};
const validDate = (date: Date, now: Date): boolean =>
  date instanceof Date && date.getTime() > 0 && date.getTime() <= now.getTime() + 300_000;

export interface CmsTrustVerifierOptions {
  trustAnchorsPem: readonly string[];
  tsaTrustAnchorsPem?: readonly string[];
  acceptedPolicies?: readonly string[];
  /** Fallback for a profile without `qualifiedPolicies`: signer certificate policy OIDs that confer QUALIFIED. */
  qualifiedPolicies?: readonly string[];
  now?: () => Date;
  fetchTsa?: (context:{signedDocument:Uint8Array;signerInfo:pkijs.SignerInfo}) => Promise<Uint8Array | undefined>;
  fetchOcsp?: (context:{certificate:pkijs.Certificate;issuer:pkijs.Certificate;signedDocument:Uint8Array;
    signerInfo:pkijs.SignerInfo}) => Promise<Uint8Array | undefined>;
  fetchCrl?: (context:{certificate:pkijs.Certificate;issuer:pkijs.Certificate;signedDocument:Uint8Array;
    signerInfo:pkijs.SignerInfo}) => Promise<Uint8Array | undefined>;
  /**
   * Consumer qualification predicate. Called at most once per verification, after every cryptographic,
   * path, TSA, revocation and PAdES check passed and only when the declarative policy rule did not
   * qualify, with the verified signer certificate and the profile as supplied. May be async; STYNX
   * imposes no timeout. A throw or rejection fails with SignatureTrustUnavailableError; truthy is QUALIFIED.
   */
  qualifiesCertificate?: (certificate: pkijs.Certificate, profile: Parameters<SignatureTrustVerifier['capabilities']>[0]) => boolean | Promise<boolean>;
  readinessChallenge?: (profile: Parameters<SignatureTrustVerifier['capabilities']>[0]) => Promise<Parameters<SignatureTrustVerifier['verifySignedArtifact']>[0]>;
}

function coveredPdf(pdf: Uint8Array, cms: Uint8Array): { covered: Uint8Array; firstRangeEnd:number; revisionEnd:number; byteRange:readonly number[] } {
  const bytes = Buffer.from(pdf);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new SignatureTrustError('Signed PDF required');
  const cmsHex=Buffer.from(cms).toString('hex');
  const ranges=[...bytes.toString('latin1').matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/gu)];
  let selected:RegExpMatchArray|undefined;
  let selectedContents:RegExpExecArray|undefined;
  for (const range of ranges) {
    const before=Number(range[2]);const after=Number(range[3]);
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || after <= before) continue;
    const placeholder=bytes.subarray(before,after);
    const contents=/^<([0-9a-fA-F]+)>$/u.exec(placeholder.toString('latin1'));
    if (contents?.[1]?.toLowerCase().startsWith(cmsHex)) {
      if (selected) throw new SignatureTrustError('Ambiguous PDF signature revisions');
      selected=range;
      selectedContents=contents;
    }
  }
  if (!selected) throw new SignatureTrustError('Matching PDF ByteRange missing');
  const [start = -1, before = -1, after = -1, tail = -1] = selected.slice(1).map(Number);
  if (start !== 0 || !Number.isSafeInteger(before) || !Number.isSafeInteger(after) ||
      !Number.isSafeInteger(tail) || before <= 0 || after <= before ||
      after + tail > bytes.length) throw new SignatureTrustError('PDF ByteRange is incomplete');
  if (!bytes.subarray(Math.max(0,before-32),before).toString('latin1').includes('/Contents'))
    throw new SignatureTrustError('PDF Contents is not the ByteRange gap');
  const embedded = selectedContents![1]!;
  if (!embedded.toLowerCase().startsWith(cmsHex) ||
      !/^0*$/u.test(embedded.slice(cmsHex.length)))
    throw new SignatureTrustError('Detached CMS does not match PDF Contents');
  const revisionEnd=after+tail;
  const covered = Buffer.concat([bytes.subarray(0, before), bytes.subarray(after,revisionEnd)]);
  return {covered,firstRangeEnd:before,revisionEnd,byteRange:[start,before,after,tail]};
}

function sequence(value:asn1js.AsnType):asn1js.AsnType[] {
  if (!(value instanceof asn1js.Sequence)) throw new SignatureTrustError('SigningCertificateV2 malformed');
  return value.valueBlock.value;
}

function verifyEssSignerBinding(value:asn1js.AsnType,signer:pkijs.Certificate,signerDer:Uint8Array):void {
  const fields=sequence(value);
  const certs=fields[0] ? sequence(fields[0]) : [];
  const first=certs[0] ? sequence(certs[0]) : [];
  let cursor=0;
  if (first[0] instanceof asn1js.Sequence) {
    const algorithm=first[0].valueBlock.value[0];
    if (!(algorithm instanceof asn1js.ObjectIdentifier) || algorithm.valueBlock.toString() !== '2.16.840.1.101.3.4.2.1')
      throw new SignatureTrustError('SigningCertificateV2 hash algorithm invalid');
    cursor++;
  }
  const hash=first[cursor++];
  if (!(hash instanceof asn1js.OctetString) ||
      !Buffer.from(hash.valueBlock.valueHexView).equals(createHash('sha256').update(signerDer).digest()))
    throw new SignatureTrustError('SigningCertificateV2 first certificate differs from signer');
  const issuerSerial=first[cursor];
  if (issuerSerial) {
    const identity=sequence(issuerSerial);
    const names=identity[0] ? sequence(identity[0]) : [];
    const serial=identity[1];
    const expectedSerial=Buffer.from(signer.serialNumber.valueBlock.valueHexView);
    const suppliedSerial=serial instanceof asn1js.Integer ? Buffer.from(serial.valueBlock.valueHexView) : Buffer.alloc(0);
    const issuerMatches=names.some(item=>item instanceof asn1js.Constructed &&
      item.idBlock.tagClass === 3 && item.idBlock.tagNumber === 4 &&
      item.valueBlock.value[0] && Buffer.from(item.valueBlock.value[0].toBER(false))
        .equals(Buffer.from(signer.issuer.toSchema().toBER(false))));
    if (!issuerMatches || !suppliedSerial.equals(expectedSerial))
      throw new SignatureTrustError('SigningCertificateV2 issuerSerial differs from signer');
  }
}

async function verifyRevocation(
  subject:pkijs.Certificate,issuer:pkijs.Certificate,anchors:pkijs.Certificate[],
  issuerPath:pkijs.Certificate[],ocsp:Uint8Array[],crls:Uint8Array[],
  modes:readonly ('ocsp'|'crl')[],at:Date,now:Date,
):Promise<'ocsp'|'crl'|undefined> {
  let unavailable=false;
  for (const mode of modes) {
    for (const evidence of mode === 'ocsp' ? ocsp : crls) {
      if (mode === 'ocsp') {
        const response=new pkijs.OCSPResponse({schema:parse(evidence)});
        if ([2,3].includes(response.responseStatus.valueBlock.valueDec)) {unavailable=true;continue;}
        if (response.responseStatus.valueBlock.valueDec !== 0 || !response.responseBytes)
          throw new SignatureTrustError('OCSP response invalid');
        const basic=new pkijs.BasicOCSPResponse({schema:parse(new Uint8Array(response.responseBytes.response.valueBlock.valueHexView))});
        const status=await response.getCertificateStatus(subject,issuer);
        if (!status.isForCertificate) continue;
        let authorizedResponder:boolean;
        try {authorizedResponder=await basic.verify({trustedCerts:anchors,issuerCerts:issuerPath});}
        catch {throw new SignatureTrustError('OCSP signature invalid');}
        if (!authorizedResponder) throw new SignatureTrustError('OCSP signature invalid');
        if (!validDate(basic.tbsResponseData.producedAt,now))
          throw new SignatureTrustError('OCSP production time invalid');
        if (basic.tbsResponseData.producedAt<at) {unavailable=true;continue;}
        let fresh=false;
        for (const item of basic.tbsResponseData.responses) {
          const algorithm=pkijs.getAlgorithmByOID(item.certID.hashAlgorithm.algorithmId) as {name?:string};
          if (!algorithm.name) continue;
          const expected=await pkijs.CertID.create(subject,{issuerCertificate:issuer,hashAlgorithm:algorithm.name});
          if (item.certID.isEqual(expected)) {
            fresh=item.thisUpdate>=at && item.thisUpdate<=new Date(now.getTime()+300_000) &&
              !!item.nextUpdate && item.nextUpdate>=at;
            break;
          }
        }
        if (!fresh) {unavailable=true;continue;}
        if (status.status === 2) {unavailable=true;continue;}
        if (status.status !== 0) throw new SignatureTrustError('Certificate revoked');
        return 'ocsp';
      }
      const crl=new pkijs.CertificateRevocationList({schema:parse(evidence)});
      if (!crl.issuer.isEqual(issuer.subject)) continue;
      if (!await crl.verify({issuerCertificate:issuer}))
        throw new SignatureTrustError('CRL signature invalid');
      if (crl.thisUpdate.value<at) {unavailable=true;continue;}
      if (crl.thisUpdate.value>new Date(now.getTime()+300_000) ||
          !crl.nextUpdate || crl.nextUpdate.value<at) {unavailable=true;continue;}
      if (crl.isCertificateRevoked(subject))
        throw new SignatureTrustError('Certificate revoked');
      return 'crl';
    }
  }
  if (unavailable) throw new SignatureTrustUnavailableError('Revocation evidence not current');
  return undefined;
}

export function createCmsTrustVerifier(options: CmsTrustVerifierOptions): SignatureTrustVerifier {
  const verifier: SignatureTrustVerifier = {
    async capabilities(profile) {
      const now = options.now?.() ?? new Date();
      if (!options.trustAnchorsPem.length || !profile.trustAnchorsPem.length || !validDate(now, now))
        throw new SignatureCapabilityError('Trust anchors or clock unavailable');
      if (profile.environment === 'production') {
        if (!options.readinessChallenge) throw new SignatureCapabilityError('Authenticated readiness challenge unavailable');
        try {
          const challenge = await options.readinessChallenge(profile);
          if (challenge.profile.id !== profile.id || challenge.profile.revision !== profile.revision)
            throw new SignatureCapabilityError('Readiness challenge profile differs');
          await verifier.verifySignedArtifact(challenge);
        } catch { throw new SignatureCapabilityError('Authenticated readiness challenge failed'); }
      }
      return {simulated:false,pades:true,tsa:true,lta:false,
        certificateValidation:['ocsp' as const,'crl' as const],
        evidenceSource:'stynx-cms',checkedAt:now};
    },
    async verifySignedArtifact(input): Promise<SignatureTrustProof> {
      try {
        const now = options.now?.() ?? new Date();
        const anchors = input.profile.trustAnchorsPem.filter(p => options.trustAnchorsPem.includes(p)).map(cert);
        if (!anchors.length) throw new SignatureTrustError('No matching trust anchor');
        if (!input.certificate.pem) throw new SignatureTrustError('Signer certificate absent');
        const signer = cert(input.certificate.pem);
        const signerDer = pemDer(input.certificate.pem);
        const { covered, firstRangeEnd, revisionEnd, byteRange } = coveredPdf(input.signedDocument, input.cmsSignature);
        const {manifest}=await readSelectedSignatureDictionary(input.signedDocument,revisionEnd,
          byteRange,input.cmsSignature);
        const pdfEvidence=await readPdfTrustEvidence(input.signedDocument,revisionEnd,input.cmsSignature);
        if (input.originalDocument.length > firstRangeEnd ||
          !Buffer.from(input.signedDocument).subarray(0,input.originalDocument.length).equals(Buffer.from(input.originalDocument)))
          throw new SignatureEvidenceMismatchError('Original document is not a signed PDF prefix');
        if (input.expectedManifestSha256 && manifest !== input.expectedManifestSha256)
          throw new SignatureTrustError('Signed manifest binding absent or mismatched');
        const signed = content(input.cmsSignature);
        if (signed.encapContentInfo.eContentType !== '1.2.840.113549.1.7.1' ||
          signed.encapContentInfo.eContent !== undefined)
          throw new SignatureTrustError('Detached id-data CMS required');
        if (signed.signerInfos.length !== 1 || !signed.signerInfos[0]?.signedAttrs?.attributes?.length)
          throw new SignatureTrustError('CMS signed attributes missing');
        const signerInfo = signed.signerInfos[0]!;
        const signedContentType=signerInfo.signedAttrs!.attributes.find(a=>a.type === '1.2.840.113549.1.9.3');
        if (signedContentType?.values.length !== 1 ||
          !(signedContentType.values[0] instanceof asn1js.ObjectIdentifier) ||
          signedContentType.values[0].valueBlock.toString() !== '1.2.840.113549.1.7.1')
          throw new SignatureTrustError('Signed CMS content type is not id-data');
        const ess=signerInfo.signedAttrs!.attributes.find(a=>a.type === '1.2.840.113549.1.9.16.2.47');
        if (!ess?.values.length)
          throw new SignatureTrustError('Signed signer-certificate binding absent');
        verifyEssSignerBinding(ess.values[0],signer,signerDer);
        const signingTimeAttr = signerInfo.signedAttrs!.attributes.find(a => a.type === '1.2.840.113549.1.9.5');
        const signingTime = (signingTimeAttr?.values[0] as {toDate?:()=>Date}|undefined)?.toDate?.();
        if (!signingTime || !validDate(signingTime,now))
          throw new SignatureTrustError('CMS signed signing time absent');
        const verified = await signed.verify({signer:0,data:der(covered),trustedCerts:anchors,
          checkChain:false,extendedMode:true});
        if (!verified.signatureVerified || !verified.signerCertificate ||
          !Buffer.from(verified.signerCertificate.toSchema().toBER(false)).equals(signerDer))
          throw new SignatureTrustError('CMS signer identity differs from supplied certificate');
        const x509 = new X509Certificate(signerDer);
        const policyOids = input.profile.acceptedPolicies ?? options.acceptedPolicies ?? [];
        if (policyOids.length && !hasPolicy(signer, policyOids))
          throw new SignatureTrustError('Certificate policy is not accepted');
        const timestampAttr=signerInfo.unsignedAttrs?.attributes.find(a=>
          a.type === '1.2.840.113549.1.9.16.2.14');
        if (timestampAttr?.values.length !== 1)
          throw new SignatureTrustError('Embedded signature timestamp absent');
        const embeddedToken=Buffer.from(timestampAttr.values[0].toBER(false));
        const token = new pkijs.ContentInfo({schema:parse(embeddedToken)});
        if (token.contentType !== pkijs.ContentInfo.SIGNED_DATA)
          throw new SignatureTrustError('Embedded timestamp is not CMS');
        const tsaData = new pkijs.SignedData({schema:token.content});
        const tsaAnchors = (options.tsaTrustAnchorsPem ?? options.trustAnchorsPem)
          .filter(p=>input.profile.trustAnchorsPem.includes(p)).map(cert);
        if (!tsaAnchors.length) throw new SignatureTrustError('No matching TSA trust anchor');
        const tstContent = tsaData.encapContentInfo.eContent;
        if (!tstContent) throw new SignatureTrustError('TSA imprint absent');
        const tst = new pkijs.TSTInfo({schema:parse(new Uint8Array(tstContent.valueBlock.valueHexView))});
        if (!validDate(tst.genTime,now)) throw new SignatureTrustError('TSA generation time invalid');
        const signatureBytes=new Uint8Array(signerInfo.signature.valueBlock.valueHexView);
        const tsaValidation=await tsaData.verify({signer:0,data:der(signatureBytes),
          trustedCerts:tsaAnchors,checkChain:true,checkDate:tst.genTime,extendedMode:true});
        if (!tsaValidation.signatureVerified || !tsaValidation.signerCertificateVerified ||
          !tsaValidation.signerCertificate)
          throw new SignatureTrustError('TSA signature invalid');
        const tsaEku=tsaValidation.signerCertificate.extensions?.find(ext=>ext.extnID === '2.5.29.37')?.parsedValue;
        if (!(tsaEku instanceof pkijs.ExtKeyUsage) ||
          !tsaEku.keyPurposes.includes('1.3.6.1.5.5.7.3.8'))
          throw new SignatureTrustError('TSA certificate lacks timeStamping EKU');
        const imprint = Buffer.from(tst.messageImprint.hashedMessage.valueBlock.valueHexView);
        const expectedImprint = createHash('sha256').update(signatureBytes).digest();
        if (tst.messageImprint.hashAlgorithm.algorithmId !== '2.16.840.1.101.3.4.2.1' ||
          !imprint.equals(expectedImprint) || !validDate(tst.genTime, now) || tst.genTime < signingTime)
          throw new SignatureTrustError('TSA imprint or time invalid');
        const validationTime=input.profile.atTime === 'trusted-timestamp' ? tst.genTime : signingTime;
        const chainValidation=await signed.verify({signer:0,data:der(covered),trustedCerts:anchors,
          checkChain:true,checkDate:validationTime,extendedMode:true});
        if (validationTime < x509.notBefore || validationTime > x509.notAfter ||
          !chainValidation.signatureVerified || !chainValidation.signerCertificateVerified ||
          chainValidation.certificatePath.length < 2 || !chainValidation.signerCertificate ||
          !Buffer.from(chainValidation.signerCertificate.toSchema().toBER(false)).equals(signerDer))
          throw new SignatureTrustError('Signer certificate path invalid at selected time');

        const modes=input.profile.revocation === 'ocsp-or-crl' ? ['ocsp','crl'] as const : [input.profile.revocation];
        const paths=[chainValidation.certificatePath,tsaValidation.certificatePath];
        let embeddedComplete=pdfEvidence.certs.length>0;
        let revocationSource:'ocsp'|'crl'|undefined;
        const processed=new Set<string>();
        for (let pathIndex=0;pathIndex<paths.length;pathIndex++) {
          const path=paths[pathIndex]!;
          if (path.length<2) throw new SignatureTrustError('Certificate path incomplete');
          for (let i=0;i<path.length-1;i++) {
            const subject=path[i]!;const certificateIssuer=path[i+1]!;
            const certificateDer=new Uint8Array(subject.toSchema().toBER(false));
            const identity=sha256Hex(certificateDer);
            if (processed.has(identity)) continue;
            processed.add(identity);
            const archivalCertificate=pdfEvidence.certs.some(item=>Buffer.from(item).equals(Buffer.from(certificateDer)));
            if (!archivalCertificate) embeddedComplete=false;
            const ocsp=pathIndex===0 && i===0 ? pdfEvidence.vriOcsp : pdfEvidence.ocsp;
            const crls=pathIndex===0 && i===0 ? pdfEvidence.vriCrls : pdfEvidence.crls;
            const pathAnchors=pathIndex===0 ? anchors : tsaAnchors;
            const evidenceTime=tst.genTime;
            let source=await verifyRevocation(subject,certificateIssuer,pathAnchors,path.slice(i+1),
              ocsp,crls,modes,evidenceTime,now);
            if (!source) {
              embeddedComplete=false;
              if (input.profile.requiredPadesProfile === 'PAdES-B-LT')
                throw new SignatureTrustError('Embedded DSS revocation evidence absent');
              const context={certificate:subject,issuer:certificateIssuer,
                signedDocument:input.signedDocument,signerInfo};
              let onlineOcsp:Uint8Array|undefined;let onlineCrl:Uint8Array|undefined;
              try {
                onlineOcsp=await options.fetchOcsp?.(context);
                onlineCrl=await options.fetchCrl?.(context);
              } catch {throw new SignatureTrustUnavailableError('Online revocation evidence unavailable');}
              source=await verifyRevocation(subject,certificateIssuer,pathAnchors,path.slice(i+1),
                onlineOcsp ? [onlineOcsp]:[],onlineCrl ? [onlineCrl]:[],
                modes,evidenceTime,now);
            }
            if (!source) throw new SignatureTrustUnavailableError('Revocation evidence unavailable');
            if (pathIndex===0 && i===0) revocationSource=source;
          }
        }
        const padesProfile=embeddedComplete ? 'PAdES-B-LT' : 'PAdES-B-T';
        if (input.profile.requiredPadesProfile === 'PAdES-B-LT' && !embeddedComplete)
          throw new SignatureTrustError('Embedded DSS evidence incomplete');
        if (input.profile.requireLta || input.profile.requiredPadesProfile === 'PAdES-B-LTA')
          throw new SignatureTrustError('Archive timestamp evidence unavailable');
        const qualifiedOids = input.profile.qualifiedPolicies ?? options.qualifiedPolicies ?? [];
        let qualifiedBy:SignatureQualificationRule|undefined=qualifiedOids.length && hasPolicy(signer,qualifiedOids)
          ? 'certificate-policy' : undefined;
        if (!qualifiedBy) {
          try {if (options.qualifiesCertificate && await options.qualifiesCertificate(signer,input.profile)) qualifiedBy='consumer-predicate';}
          catch {throw new SignatureTrustUnavailableError('Certificate qualification service unavailable');}
        }
        const achievedLevel = qualifiedBy ? 'QUALIFIED' : 'ADVANCED';
        return {verifierKind:'stynx-cms',profileId:input.profile.id,profileRevision:input.profile.revision,
          achievedLevel,...(qualifiedBy ? {qualifiedBy} : {}),padesProfile,
          originalDocumentSha256:sha256Hex(input.originalDocument),signedDocumentSha256:sha256Hex(input.signedDocument),
          cmsSha256:sha256Hex(input.cmsSignature),signerCertificateSha256:sha256Hex(signerDer),
          chainSha256:chainValidation.certificatePath.map(a => sha256Hex(new Uint8Array(a.toSchema().toBER(false)))),
          signedAt:signingTime,tsaAt:tst.genTime,certificateValidatedAt:validationTime,revocationSource:revocationSource!,
          verificationRef:sha256Hex(input.cmsSignature),...(manifest ? {boundManifestSha256:manifest} : {})};
      } catch (error) {
        if (error instanceof SignatureTrustError || error instanceof SignatureTrustUnavailableError) throw error;
        throw new SignatureTrustError('Cryptographic trust evidence is invalid');
      }
    },
  };
  branded.add(verifier);
  return verifier;
}
