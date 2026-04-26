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

export class SessionSigningKeyError extends Error {
  constructor(message: string) {
    super(message);
  }
}
