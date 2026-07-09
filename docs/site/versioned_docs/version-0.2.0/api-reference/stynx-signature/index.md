**@stynx-nyx/signature**

---

# @stynx-nyx/signature

Public PAdES/TSA signature facade exports.

## Classes

- [GovBrSandboxAdapter](classes/GovBrSandboxAdapter.md)
- [HttpSignatureProviderClient](classes/HttpSignatureProviderClient.md)
- [MockPadesEvidenceAdapter](classes/MockPadesEvidenceAdapter.md)
- [ProviderBackedSignatureBackend](classes/ProviderBackedSignatureBackend.md)
- [SequentialSigner](classes/SequentialSigner.md)
- [SignatureCertificateValidationError](classes/SignatureCertificateValidationError.md)
- [SignatureError](classes/SignatureError.md)
- [SignatureHashMismatchError](classes/SignatureHashMismatchError.md)
- [SignatureProviderConfigurationError](classes/SignatureProviderConfigurationError.md)
- [SignatureProviderError](classes/SignatureProviderError.md)
- [SignatureProviderResponseError](classes/SignatureProviderResponseError.md)
- [SignatureService](classes/SignatureService.md)
- [SignatureVerificationInputError](classes/SignatureVerificationInputError.md)
- [StynxSignatureModule](classes/StynxSignatureModule.md)
- [XmlDSigInputError](classes/XmlDSigInputError.md)
- [XmlDSigSigner](classes/XmlDSigSigner.md)
- [XmlDSigVerificationError](classes/XmlDSigVerificationError.md)
- [XmlDSigVerifier](classes/XmlDSigVerifier.md)

## Interfaces

- [CertificateValidationRequest](interfaces/CertificateValidationRequest.md)
- [CertificateValidationResult](interfaces/CertificateValidationResult.md)
- [GovBrSandboxEvidence](interfaces/GovBrSandboxEvidence.md)
- [GovBrSandboxRequest](interfaces/GovBrSandboxRequest.md)
- [GovBrSandboxResult](interfaces/GovBrSandboxResult.md)
- [GovBrSandboxSigner](interfaces/GovBrSandboxSigner.md)
- [HttpSignatureProviderOptions](interfaces/HttpSignatureProviderOptions.md)
- [PadesEvidenceEnvelope](interfaces/PadesEvidenceEnvelope.md)
- [PadesEvidenceRequest](interfaces/PadesEvidenceRequest.md)
- [PadesEvidenceResult](interfaces/PadesEvidenceResult.md)
- [ProviderSignRequest](interfaces/ProviderSignRequest.md)
- [ProviderSignResult](interfaces/ProviderSignResult.md)
- [ProviderVerifyRequest](interfaces/ProviderVerifyRequest.md)
- [SequentialEnvelope](interfaces/SequentialEnvelope.md)
- [SequentialReadResult](interfaces/SequentialReadResult.md)
- [SequentialSignatureEntry](interfaces/SequentialSignatureEntry.md)
- [SequentialSignerRef](interfaces/SequentialSignerRef.md)
- [SequentialVerifyResult](interfaces/SequentialVerifyResult.md)
- [Sha256Options](interfaces/Sha256Options.md)
- [SignatureBackend](interfaces/SignatureBackend.md)
- [SignatureCertificateRef](interfaces/SignatureCertificateRef.md)
- [SignatureCredentialRef](interfaces/SignatureCredentialRef.md)
- [SignatureEvidence](interfaces/SignatureEvidence.md)
- [SignatureProviderClient](interfaces/SignatureProviderClient.md)
- [SignatureRequest](interfaces/SignatureRequest.md)
- [SignatureResult](interfaces/SignatureResult.md)
- [StynxSignatureModuleOptions](interfaces/StynxSignatureModuleOptions.md)
- [TsaOptions](interfaces/TsaOptions.md)
- [VerificationPolicy](interfaces/VerificationPolicy.md)
- [VerifyRequest](interfaces/VerifyRequest.md)
- [VerifyResult](interfaces/VerifyResult.md)
- [XmlDSigPrivateKey](interfaces/XmlDSigPrivateKey.md)
- [XmlDSigPublicKey](interfaces/XmlDSigPublicKey.md)
- [XmlDSigReferenceMismatch](interfaces/XmlDSigReferenceMismatch.md)
- [XmlDSigReferenceOptions](interfaces/XmlDSigReferenceOptions.md)
- [XmlDSigSignatureLocation](interfaces/XmlDSigSignatureLocation.md)
- [XmlDSigSignOptions](interfaces/XmlDSigSignOptions.md)
- [XmlDSigVerifyOptions](interfaces/XmlDSigVerifyOptions.md)

## Type Aliases

- [DigestAlgorithm](type-aliases/DigestAlgorithm.md)
- [GovBrSandboxDecision](type-aliases/GovBrSandboxDecision.md)
- [GovBrSandboxState](type-aliases/GovBrSandboxState.md)
- [RevocationSource](type-aliases/RevocationSource.md)
- [Sha256Encoding](type-aliases/Sha256Encoding.md)
- [SignatureAlgorithm](type-aliases/SignatureAlgorithm.md)
- [XmlDSigCanonicalizationAlgorithm](type-aliases/XmlDSigCanonicalizationAlgorithm.md)
- [XmlDSigDigestAlgorithm](type-aliases/XmlDSigDigestAlgorithm.md)
- [XmlDSigKeyMaterial](type-aliases/XmlDSigKeyMaterial.md)
- [XmlDSigReferenceIdAttribute](type-aliases/XmlDSigReferenceIdAttribute.md)
- [XmlDSigSignatureAlgorithm](type-aliases/XmlDSigSignatureAlgorithm.md)
- [XmlDSigTransformAlgorithm](type-aliases/XmlDSigTransformAlgorithm.md)
- [XmlDSigVerifyResult](type-aliases/XmlDSigVerifyResult.md)

## Variables

- [DEFAULT_XMLDSIG_CANONICALIZATION](variables/DEFAULT_XMLDSIG_CANONICALIZATION.md)
- [DEFAULT_XMLDSIG_DIGEST](variables/DEFAULT_XMLDSIG_DIGEST.md)
- [DEFAULT_XMLDSIG_SIGNATURE](variables/DEFAULT_XMLDSIG_SIGNATURE.md)
- [STYNX_SIGNATURE_BACKEND](variables/STYNX_SIGNATURE_BACKEND.md)
- [STYNX_SIGNATURE_OPTIONS](variables/STYNX_SIGNATURE_OPTIONS.md)
- [STYNX_SIGNATURE_PROVIDER_CLIENT](variables/STYNX_SIGNATURE_PROVIDER_CLIENT.md)
- [XMLDSIG_ALGORITHMS](variables/XMLDSIG_ALGORITHMS.md)

## Functions

- [canonicalJson](functions/canonicalJson.md)
- [canonicalXmlDigest](functions/canonicalXmlDigest.md)
- [createGovBrSandboxAdapter](functions/createGovBrSandboxAdapter.md)
- [createMockPadesEvidenceAdapter](functions/createMockPadesEvidenceAdapter.md)
- [createMockSignatureBackend](functions/createMockSignatureBackend.md)
- [decodePadesEvidenceBlock](functions/decodePadesEvidenceBlock.md)
- [defaultXmlDSigTransforms](functions/defaultXmlDSigTransforms.md)
- [encodePadesEvidenceBlock](functions/encodePadesEvidenceBlock.md)
- [govBrSandboxCallbackUrl](functions/govBrSandboxCallbackUrl.md)
- [readSequentialEnvelope](functions/readSequentialEnvelope.md)
- [resolveReference](functions/resolveReference.md)
- [sha256](functions/sha256.md)
- [sha256CanonicalJson](functions/sha256CanonicalJson.md)
- [sha256Hex](functions/sha256Hex.md)
- [toXPathLiteral](functions/toXPathLiteral.md)
- [verifySequentialEnvelope](functions/verifySequentialEnvelope.md)
