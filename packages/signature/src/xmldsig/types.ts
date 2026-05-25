import type { KeyLike } from 'node:crypto';
import type {
  CanonicalizationAlgorithmType,
  CanonicalizationOrTransformAlgorithmType,
  HashAlgorithmType,
  SignatureAlgorithmType,
} from 'xml-crypto/lib/types';

export type XmlDSigKeyMaterial = KeyLike;

export type XmlDSigReferenceIdAttribute = 'Id' | 'ID' | 'id' | string;

export interface XmlDSigPrivateKey {
  privateKeyPem: XmlDSigKeyMaterial;
  certificatePem?: XmlDSigKeyMaterial;
  publicKeyPem?: XmlDSigKeyMaterial;
}

export interface XmlDSigPublicKey {
  keyId?: string;
  publicKeyPem: XmlDSigKeyMaterial;
}

export interface XmlDSigReferenceOptions {
  id?: string;
  idAttribute?: XmlDSigReferenceIdAttribute;
  idAttributes?: XmlDSigReferenceIdAttribute[];
  xpath?: string;
  uri?: string;
}

export interface XmlDSigSignatureLocation {
  reference: string;
  action?: 'append' | 'prepend' | 'before' | 'after';
}

export interface XmlDSigSignOptions {
  key: XmlDSigPrivateKey;
  reference?: XmlDSigReferenceOptions;
  location?: XmlDSigSignatureLocation;
  canonicalizationAlgorithm?: CanonicalizationAlgorithmType;
  transforms?: ReadonlyArray<CanonicalizationOrTransformAlgorithmType>;
  digestAlgorithm?: HashAlgorithmType;
  signatureAlgorithm?: SignatureAlgorithmType;
  includeKeyInfo?: boolean;
  prefix?: string;
  attrs?: Record<string, string>;
  existingPrefixes?: Record<string, string>;
}

export interface XmlDSigVerifyOptions {
  keys?: XmlDSigPublicKey[];
  idAttribute?: XmlDSigReferenceIdAttribute;
  allowKeyInfoCertificate?: boolean;
}

export interface XmlDSigReferenceMismatch {
  reference: string;
  expected: string;
  actual: string;
  digestAlgorithm?: string;
}

export type XmlDSigVerifyResult =
  | {
      ok: true;
      keyId?: string;
      signatureCount: number;
      signedReferences: string[];
    }
  | {
      ok: false;
      signatureCount: number;
      mismatches: XmlDSigReferenceMismatch[];
      reason: string;
    };

export class XmlDSigInputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class XmlDSigVerificationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
