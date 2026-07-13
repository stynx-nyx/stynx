export type SessionControlErrorCode =
  | 'SESSION_INVALID'
  | 'SESSION_CONTEXT_OVERRIDE'
  | 'SESSION_UNAUTHENTICATED'
  | 'SESSION_FORBIDDEN'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_IDEMPOTENCY_CONFLICT'
  | 'SESSION_CAPABILITY_UNSUPPORTED'
  | 'SESSION_OPERATION_PENDING'
  | 'SESSION_PROVIDER_FAILED';
export class SessionControlError extends Error {
  constructor(
    readonly code: SessionControlErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}
