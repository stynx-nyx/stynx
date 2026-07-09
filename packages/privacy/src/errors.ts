import { StynxError } from '@stynx-nyx/core';

export class PrivacyValidationError extends StynxError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'PRIVACY_VALIDATION_ERROR',
      status: 400,
      ...(context ? { context } : {}),
    });
  }
}

export class PrivacyConfigurationError extends StynxError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'PRIVACY_CONFIGURATION_ERROR',
      status: 500,
      ...(context ? { context } : {}),
    });
  }
}
