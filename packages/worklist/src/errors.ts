import { StynxError } from '@stynx-nyx/core';

export class StynxWorklistError extends StynxError {}

export class WorklistNotFoundError extends StynxWorklistError {
  constructor(entity: 'queue' | 'item', id: string) {
    super(`Worklist ${entity} not found: ${id}`, {
      code: 'WORKLIST_NOT_FOUND',
      status: 404,
      context: { entity, id },
    });
  }
}

export class WorklistConflictError extends StynxWorklistError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, {
      code: 'WORKLIST_CONFLICT',
      status: 409,
      ...(context ? { context } : {}),
      ...(cause ? { cause } : {}),
    });
  }
}

export class WorklistInputError extends StynxWorklistError {
  constructor(message: string, context?: Record<string, unknown>, cause?: unknown) {
    super(message, {
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
      ...(context ? { context } : {}),
      ...(cause ? { cause } : {}),
    });
  }
}

export class WorklistForbiddenError extends StynxWorklistError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      code: 'WORKLIST_FORBIDDEN',
      status: 403,
      ...(cause ? { cause } : {}),
    });
  }
}

export class UnknownWorklistStrategyError extends StynxWorklistError {
  constructor(key: string) {
    super(`Unknown worklist strategy: ${key}`, {
      code: 'WORKLIST_STRATEGY_UNKNOWN',
      status: 400,
      context: { key },
    });
  }
}

export class WorklistStrategyRegistrationError extends StynxWorklistError {
  constructor(message: string, key: string) {
    super(message, {
      code: 'WORKLIST_STRATEGY_REGISTRATION_INVALID',
      status: 500,
      context: { key },
    });
  }
}

export class WorklistCalendarRequiredError extends StynxWorklistError {
  constructor() {
    super('A business calendar adapter is required for business-day deadlines', {
      code: 'WORKLIST_BUSINESS_CALENDAR_REQUIRED',
      status: 500,
    });
  }
}

export class WorklistSchedulerRequiredError extends StynxWorklistError {
  constructor() {
    super('A worklist scheduler adapter is required to schedule breach detection', {
      code: 'WORKLIST_SCHEDULER_REQUIRED',
      status: 500,
    });
  }
}
