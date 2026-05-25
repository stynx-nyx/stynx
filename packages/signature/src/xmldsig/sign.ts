import { SignedXml } from 'xml-crypto';
import type { ComputeSignatureOptions, SignedXmlOptions } from 'xml-crypto/lib/types';
import {
  DEFAULT_XMLDSIG_CANONICALIZATION,
  DEFAULT_XMLDSIG_DIGEST,
  DEFAULT_XMLDSIG_SIGNATURE,
  defaultXmlDSigTransforms,
} from './c14n';
import type { XmlDSigReferenceOptions, XmlDSigSignOptions } from './types';
import { XmlDSigInputError } from './types';

const DEFAULT_ID_ATTRIBUTES = ['Id', 'ID', 'id'] as const;

export class XmlDSigSigner {
  sign(xml: string, options: XmlDSigSignOptions): string {
    const reference = resolveReference(xml, options.reference);
    const canonicalizationAlgorithm =
      options.canonicalizationAlgorithm ?? DEFAULT_XMLDSIG_CANONICALIZATION;
    const transforms =
      options.transforms ?? defaultXmlDSigTransforms(canonicalizationAlgorithm);

    const signerOptions: SignedXmlOptions = {
      privateKey: options.key.privateKeyPem,
      canonicalizationAlgorithm,
      signatureAlgorithm: options.signatureAlgorithm ?? DEFAULT_XMLDSIG_SIGNATURE,
      idAttribute: reference.idAttribute,
    };
    const keyInfoMaterial = options.key.certificatePem ?? options.key.publicKeyPem;
    if (keyInfoMaterial) {
      signerOptions.publicCert = keyInfoMaterial;
    }
    if (options.includeKeyInfo === false) {
      signerOptions.getKeyInfoContent = () => null;
    }

    const signer = new SignedXml(signerOptions);
    signer.addReference({
      xpath: reference.xpath,
      uri: reference.uri,
      transforms,
      digestAlgorithm: options.digestAlgorithm ?? DEFAULT_XMLDSIG_DIGEST,
    });

    const computeOptions: ComputeSignatureOptions = {};
    const location = options.location ?? {
      reference: reference.xpath,
      action: 'append' as const,
    };
    computeOptions.location = {
      reference: location.reference,
      action: location.action ?? 'append',
    };
    if (options.prefix) {
      computeOptions.prefix = options.prefix;
    }
    if (options.attrs) {
      computeOptions.attrs = options.attrs;
    }
    if (options.existingPrefixes) {
      computeOptions.existingPrefixes = options.existingPrefixes;
    }

    signer.computeSignature(xml, computeOptions);
    return signer.getSignedXml();
  }
}

export function resolveReference(
  xml: string,
  reference: XmlDSigReferenceOptions = {},
): Required<Pick<XmlDSigReferenceOptions, 'id' | 'idAttribute' | 'xpath' | 'uri'>> {
  if (reference.xpath) {
    const id = reference.id ?? findReferenceId(xml, reference);
    return {
      id,
      idAttribute: reference.idAttribute ?? 'Id',
      xpath: reference.xpath,
      uri: reference.uri ?? `#${id}`,
    };
  }

  const id = reference.id ?? findReferenceId(xml, reference);
  const idAttribute = reference.idAttribute ?? findIdAttribute(xml, id, reference);
  return {
    id,
    idAttribute,
    xpath: `//*[@${idAttribute}=${toXPathLiteral(id)}]`,
    uri: reference.uri ?? `#${id}`,
  };
}

function findReferenceId(xml: string, reference: XmlDSigReferenceOptions): string {
  const idAttributes = reference.idAttributes ?? DEFAULT_ID_ATTRIBUTES;
  for (const idAttribute of idAttributes) {
    const match = new RegExp(
      `\\s${escapeRegExp(idAttribute)}=(["'])([^"']+)\\1`,
      'u',
    ).exec(xml);
    if (match?.[2]) {
      return match[2];
    }
  }
  throw new XmlDSigInputError(
    `XMLDSig XML must include one of these ID attributes: ${idAttributes.join(', ')}`,
  );
}

function findIdAttribute(
  xml: string,
  id: string,
  reference: XmlDSigReferenceOptions,
): string {
  const idAttributes = reference.idAttributes ?? DEFAULT_ID_ATTRIBUTES;
  for (const idAttribute of idAttributes) {
    const pattern = new RegExp(
      `\\s${escapeRegExp(idAttribute)}=(["'])${escapeRegExp(id)}\\1`,
      'u',
    );
    if (pattern.test(xml)) {
      return idAttribute;
    }
  }
  return reference.idAttribute ?? 'Id';
}

export function toXPathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
