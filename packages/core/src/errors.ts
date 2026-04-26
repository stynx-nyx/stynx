export interface StynxErrorOptions {
  code: string;
  status: number;
  context?: Record<string, unknown>;
  cause?: unknown;
  messageKey?: string;
}

export class StynxError extends Error {
  readonly code: string;
  readonly status: number;
  readonly context?: Record<string, unknown>;
  readonly messageKey: string;

  constructor(message: string, options: StynxErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.messageKey = options.messageKey ?? options.code;
    if (options.context !== undefined) {
      this.context = options.context;
    }
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export class RequestContextMissingError extends StynxError {
  constructor() {
    super('Request context is not active', {
      code: 'REQUEST_CONTEXT_MISSING',
      status: 500,
    });
  }
}

export class RequestContextMutationError extends StynxError {
  constructor() {
    super('Request context mutations are only allowed inside an active request frame', {
      code: 'REQUEST_CONTEXT_MUTATION_FORBIDDEN',
      status: 500,
    });
  }
}

export class ConfigurationValidationError extends StynxError {
  constructor(issues: unknown) {
    super('Configuration validation failed', {
      code: 'CONFIGURATION_VALIDATION_ERROR',
      status: 500,
      context: { issues: issues as unknown },
    });
  }
}

export class SystemContextRequiredError extends StynxError {
  constructor(reason?: string) {
    super('System context is required for this operation', {
      code: 'SYSTEM_CONTEXT_REQUIRED',
      status: 500,
      ...(reason ? { context: { reason } } : {}),
    });
  }
}

export class SecretLoadError extends StynxError {
  constructor(secretId: string, cause: unknown) {
    super(`Unable to load secret "${secretId}"`, {
      code: 'SECRET_LOAD_ERROR',
      status: 500,
      context: { secretId },
      cause,
    });
  }
}
