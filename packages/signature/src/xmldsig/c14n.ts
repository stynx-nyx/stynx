export const XMLDSIG_ALGORITHMS = {
  canonicalization: {
    inclusive:
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    inclusiveWithComments:
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments',
    exclusive: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    exclusiveWithComments:
      'http://www.w3.org/2001/10/xml-exc-c14n#WithComments',
  },
  digest: {
    sha1: 'http://www.w3.org/2000/09/xmldsig#sha1',
    sha256: 'http://www.w3.org/2001/04/xmlenc#sha256',
    sha512: 'http://www.w3.org/2001/04/xmlenc#sha512',
  },
  signature: {
    rsaSha1: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    rsaSha256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    rsaSha512: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
  },
  transform: {
    envelopedSignature: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
  },
} as const;

export type XmlDSigCanonicalizationAlgorithm =
  (typeof XMLDSIG_ALGORITHMS.canonicalization)[keyof typeof XMLDSIG_ALGORITHMS.canonicalization];

export type XmlDSigDigestAlgorithm =
  (typeof XMLDSIG_ALGORITHMS.digest)[keyof typeof XMLDSIG_ALGORITHMS.digest];

export type XmlDSigSignatureAlgorithm =
  (typeof XMLDSIG_ALGORITHMS.signature)[keyof typeof XMLDSIG_ALGORITHMS.signature];

export type XmlDSigTransformAlgorithm =
  | XmlDSigCanonicalizationAlgorithm
  | (typeof XMLDSIG_ALGORITHMS.transform)[keyof typeof XMLDSIG_ALGORITHMS.transform];

export const DEFAULT_XMLDSIG_CANONICALIZATION =
  XMLDSIG_ALGORITHMS.canonicalization.inclusive;

export const DEFAULT_XMLDSIG_DIGEST = XMLDSIG_ALGORITHMS.digest.sha256;

export const DEFAULT_XMLDSIG_SIGNATURE =
  XMLDSIG_ALGORITHMS.signature.rsaSha256;

export function defaultXmlDSigTransforms(
  canonicalizationAlgorithm: string = DEFAULT_XMLDSIG_CANONICALIZATION,
): string[] {
  return [XMLDSIG_ALGORITHMS.transform.envelopedSignature, canonicalizationAlgorithm];
}
