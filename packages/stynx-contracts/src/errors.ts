export class StynxError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StynxError';
  }
}

export class AuthenticationError extends StynxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends StynxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}

export class IdentityAdminError extends StynxError {
  constructor(
    code:
      | 'IDENTITY_NOT_FOUND'
      | 'IDENTITY_FORBIDDEN'
      | 'IDENTITY_CONFLICT'
      | 'IDENTITY_RATE_LIMITED'
      | 'IDENTITY_VALIDATION_ERROR'
      | 'IDENTITY_PROVIDER_ERROR',
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, code, details);
    this.name = 'IdentityAdminError';
  }
}

export interface ResultEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
