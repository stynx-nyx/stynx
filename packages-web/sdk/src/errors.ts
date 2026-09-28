export interface StynxErrorPayload {
  code?: string;
  errorCode?: string;
  message?: string;
  context?: Record<string, unknown>;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class StynxSdkError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends StynxSdkError {}
export class ForbiddenError extends StynxSdkError {}
export class NotFoundError extends StynxSdkError {}
export class ConflictError extends StynxSdkError {}
export class ValidationError extends StynxSdkError {}
export class RateLimitError extends StynxSdkError {}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveMessage(status: number, payload: unknown): string {
  if (isObject(payload) && typeof payload.message === 'string' && payload.message.length > 0) {
    return payload.message;
  }
  return `Request failed with status ${status}`;
}

function resolveCode(payload: unknown): string | undefined {
  if (!isObject(payload)) return undefined;
  if (typeof payload.errorCode === 'string') return payload.errorCode;
  return typeof payload.code === 'string' ? payload.code : undefined;
}

function resolveContext(payload: unknown): Record<string, unknown> | undefined {
  if (!isObject(payload)) return undefined;
  const requestId = typeof payload.requestId === 'string' ? payload.requestId : undefined;
  if (isObject(payload.context)) {
    return requestId && !Object.prototype.hasOwnProperty.call(payload.context, 'requestId')
      ? { ...payload.context, requestId }
      : payload.context;
  }
  const details = isObject(payload.details) ? payload.details : undefined;
  if (!details && !requestId) return undefined;
  return {
    ...details,
    ...(requestId && !Object.prototype.hasOwnProperty.call(details ?? {}, 'requestId')
      ? { requestId } : {}),
  };
}

export function createStynxSdkError(status: number, payload?: unknown): StynxSdkError {
  const message = resolveMessage(status, payload);
  const code = resolveCode(payload);
  const context = resolveContext(payload);

  if (status === 401) {
    return new UnauthorizedError(message, status, code, context, payload);
  }
  if (status === 403) {
    return new ForbiddenError(message, status, code, context, payload);
  }
  if (status === 404) {
    return new NotFoundError(message, status, code, context, payload);
  }
  if (status === 409) {
    return new ConflictError(message, status, code, context, payload);
  }
  if (status === 429) {
    return new RateLimitError(message, status, code, context, payload);
  }
  if (
    status === 400
    || status === 422
    || (typeof code === 'string' && code.endsWith('_VALIDATION_ERROR'))
  ) {
    return new ValidationError(message, status, code, context, payload);
  }
  return new StynxSdkError(message, status, code, context, payload);
}
