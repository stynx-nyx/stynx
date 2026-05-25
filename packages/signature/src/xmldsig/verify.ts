import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
import type { Element, Node } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';
import type { Reference, SignedXmlOptions } from 'xml-crypto/lib/types';
import { XMLDSIG_ALGORITHMS } from './c14n';
import type {
  XmlDSigPublicKey,
  XmlDSigReferenceMismatch,
  XmlDSigVerifyOptions,
  XmlDSigVerifyResult,
} from './types';
import { XmlDSigVerificationError } from './types';

const SIGNATURE_PATTERN =
  /<(?:\w+:)?Signature\b[\s\S]*?<\/(?:\w+:)?Signature>/gu;

export class XmlDSigVerifier {
  verify(xml: string, options: XmlDSigVerifyOptions = {}): XmlDSigVerifyResult {
    const signatureXml = firstSignatureXml(xml);
    const signatureCount = countSignatures(xml);
    if (!signatureXml) {
      return {
        ok: false,
        signatureCount: 0,
        reason: 'missing-signature',
        mismatches: [],
      };
    }

    const keys = options.keys ?? [];
    if (keys.length > 0) {
      return verifyWithKeys(xml, signatureXml, signatureCount, keys, options);
    }

    if (options.allowKeyInfoCertificate === false || !hasEmbeddedCertificate(signatureXml)) {
      throw new XmlDSigVerificationError(
        'XMLDSig verification requires a public key or an embedded X509Certificate KeyInfo',
      );
    }
    return verifyWithEmbeddedKeyInfo(xml, signatureXml, signatureCount, options);
  }
}

function verifyWithKeys(
  xml: string,
  signatureXml: string,
  signatureCount: number,
  keys: XmlDSigPublicKey[],
  options: XmlDSigVerifyOptions,
): XmlDSigVerifyResult {
  const failures: XmlDSigReferenceMismatch[] = [];
  for (const key of keys) {
    const verifier = createVerifier(options, { publicCert: key.publicKeyPem });
    verifier.loadSignature(signatureXml);
    if (checkSignature(verifier, xml)) {
      return {
        ok: true,
        signatureCount,
        signedReferences: verifier.getSignedReferences(),
        ...(key.keyId ? { keyId: key.keyId } : {}),
      };
    }
    failures.push(...referenceMismatches(verifier, xml));
  }
  return failedResult(signatureCount, failures);
}

function verifyWithEmbeddedKeyInfo(
  xml: string,
  signatureXml: string,
  signatureCount: number,
  options: XmlDSigVerifyOptions,
): XmlDSigVerifyResult {
  const verifier = createVerifier(options, {
    getCertFromKeyInfo: SignedXml.getCertFromKeyInfo,
  });
  verifier.loadSignature(signatureXml);
  if (checkSignature(verifier, xml)) {
    return {
      ok: true,
      signatureCount,
      signedReferences: verifier.getSignedReferences(),
    };
  }
  return failedResult(signatureCount, referenceMismatches(verifier, xml));
}

function createVerifier(
  options: XmlDSigVerifyOptions,
  overrides: SignedXmlOptions,
): SignedXml {
  const verifierOptions: SignedXmlOptions = { ...overrides };
  if (options.idAttribute) {
    verifierOptions.idAttribute = options.idAttribute;
  }
  return new SignedXml(verifierOptions);
}

function checkSignature(verifier: SignedXml, xml: string): boolean {
  try {
    return verifier.checkSignature(xml);
  } catch {
    return false;
  }
}

function failedResult(
  signatureCount: number,
  mismatches: XmlDSigReferenceMismatch[],
): XmlDSigVerifyResult {
  return {
    ok: false,
    signatureCount,
    reason: mismatches.length > 0 ? 'reference-digest-mismatch' : 'signature-mismatch',
    mismatches:
      mismatches.length > 0
        ? mismatches
        : [
            {
              reference: 'SignedInfo',
              expected: 'valid signature value',
              actual: 'invalid signature value',
            },
          ],
  };
}

function referenceMismatches(
  verifier: SignedXml,
  xml: string,
): XmlDSigReferenceMismatch[] {
  return verifier.getReferences().map((reference) => {
    const expected =
      typeof reference.digestValue === 'string'
        ? reference.digestValue
        : 'unavailable';
    return {
      reference: reference.uri || reference.xpath || 'unknown-reference',
      expected,
      actual: calculateReferenceDigest(verifier, xml, reference) ?? 'unavailable',
      digestAlgorithm: reference.digestAlgorithm,
    };
  });
}

function calculateReferenceDigest(
  verifier: SignedXml,
  xml: string,
  reference: Reference,
): string | undefined {
  const referenceId = reference.uri?.startsWith('#')
    ? reference.uri.slice(1)
    : undefined;
  if (!referenceId) {
    return undefined;
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const node = findElementById(doc.documentElement, referenceId);
  if (!node) {
    return undefined;
  }
  const canonicalXml = verifier.getCanonXml(reference.transforms, node as never);
  return digest(reference.digestAlgorithm, canonicalXml);
}

function findElementById(root: Element | null, id: string): Element | null {
  if (!root) {
    return null;
  }
  if (
    root.getAttribute('Id') === id ||
    root.getAttribute('ID') === id ||
    root.getAttribute('id') === id
  ) {
    return root;
  }
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const child = root.childNodes.item(index);
    if (isElement(child)) {
      const match = findElementById(child, id);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

function isElement(node: Node | null): node is Element {
  return node?.nodeType === 1;
}

function digest(algorithm: string, canonicalXml: string): string | undefined {
  if (algorithm === XMLDSIG_ALGORITHMS.digest.sha1) {
    return createHash('sha1').update(canonicalXml).digest('base64');
  }
  if (algorithm === XMLDSIG_ALGORITHMS.digest.sha256) {
    return createHash('sha256').update(canonicalXml).digest('base64');
  }
  if (algorithm === XMLDSIG_ALGORITHMS.digest.sha512) {
    return createHash('sha512').update(canonicalXml).digest('base64');
  }
  return undefined;
}

function firstSignatureXml(xml: string): string | undefined {
  SIGNATURE_PATTERN.lastIndex = 0;
  return SIGNATURE_PATTERN.exec(xml)?.[0];
}

function countSignatures(xml: string): number {
  SIGNATURE_PATTERN.lastIndex = 0;
  return [...xml.matchAll(SIGNATURE_PATTERN)].length;
}

function hasEmbeddedCertificate(signatureXml: string): boolean {
  return /<(?:\w+:)?X509Certificate\b/u.test(signatureXml);
}
