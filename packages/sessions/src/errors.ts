import { StynxError } from '@stynx-nyx/core';

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('Refresh token is invalid');
  }
}

export class RefreshTokenReuseDetectedError extends Error {
  constructor(readonly sid: string) {
    super(`Refresh token reuse detected for session ${sid}`);
  }
}

export class SessionExpiredError extends Error {
  constructor(readonly sid: string) {
    super(`Session ${sid} has expired`);
  }
}

export class SessionConflictError extends StynxError {
  declare readonly code: 'SESSION_CONFLICT';
  constructor() {
    super('SESSION_CONFLICT', { code: 'SESSION_CONFLICT', status: 409 });
  }
}

export class StrongFactorRequiredError extends StynxError {
  declare readonly code: 'STRONG_FACTOR_REQUIRED';
  constructor() {
    super('STRONG_FACTOR_REQUIRED', { code: 'STRONG_FACTOR_REQUIRED', status: 403 });
  }
}

export class SessionSigningKeyError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SessionExchangeError extends Error {
  constructor(
    public readonly code:
      | 'SESSION_NOT_FOUND'
      | 'SESSION_OWNER_MISMATCH'
      | 'SESSION_NOT_ACTIVE',
    message: string,
  ) {
    super(message);
    this.name = 'SessionExchangeError';
  }
}
