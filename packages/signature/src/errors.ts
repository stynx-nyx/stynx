export class SignatureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class SignatureHashMismatchError extends SignatureError {
  constructor(expected: string, actual: string) {
    super(`Document SHA-256 mismatch: expected ${expected}, got ${actual}`);
  }
}

export class SignatureCertificateValidationError extends SignatureError {
  constructor(reason = 'Signer certificate validation failed') {
    super(reason);
  }
}

export class SignatureProviderConfigurationError extends SignatureError {
  constructor(message = 'No @stynx/signature provider configured') {
    super(message);
  }
}

export class SignatureProviderError extends SignatureError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class SignatureProviderResponseError extends SignatureProviderError {
  constructor(message: string) {
    super(`Malformed signature provider response: ${message}`);
  }
}

export class SignatureVerificationInputError extends SignatureError {
  constructor(message = 'signedDocument or cmsSignature is required to verify a signature') {
    super(message);
  }
}
