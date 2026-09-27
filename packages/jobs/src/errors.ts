import { StynxError } from '@stynx-nyx/core';

export class StynxJobsError extends StynxError {}

export class JobTenantMismatchError extends StynxJobsError {
  constructor(tenantId: string, callerTenantId: string) {
    super('Job tenant does not match the active tenant', { code: 'JOB_TENANT_MISMATCH', status: 403, context: { tenantId, callerTenantId } });
  }
}

export class JobActorMembershipError extends StynxJobsError {
  constructor(tenantId: string, actorId: string) {
    super('Job actor has no active tenant membership', { code: 'JOB_ACTOR_MEMBERSHIP', status: 403, context: { tenantId, actorId } });
  }
}

export class JobActorAssignmentDeniedError extends StynxJobsError {
  constructor(tenantId: string, actorId: string) {
    super('Technical actor assignment denied', { code: 'JOB_ACTOR_ASSIGNMENT_DENIED', status: 403, context: { tenantId, actorId } });
  }
}

export class ScheduleActorRequiredError extends StynxJobsError {
  constructor() {
    super('An active technical actor is required for an enabled schedule', { code: 'SCHEDULE_ACTOR_REQUIRED', status: 400 });
  }
}

export class JobNotFoundError extends StynxJobsError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`, {
      code: 'JOB_NOT_FOUND',
      status: 404,
      context: { jobId },
    });
  }
}

export class ScheduleNotFoundError extends StynxJobsError {
  constructor(scheduleId: string) {
    super(`Schedule not found: ${scheduleId}`, {
      code: 'SCHEDULE_NOT_FOUND',
      status: 404,
      context: { scheduleId },
    });
  }
}

export class UnknownJobTypeError extends StynxJobsError {
  constructor(jobType: string) {
    super(`No handler registered for job type: ${jobType}`, {
      code: 'JOB_TYPE_UNKNOWN',
      status: 500,
      context: { jobType },
    });
  }
}

export class DuplicateJobTypeHandlerError extends StynxJobsError {
  constructor(jobType: string) {
    super(`A handler is already registered for job type: ${jobType}`, {
      code: 'JOB_TYPE_HANDLER_DUPLICATE',
      status: 500,
      context: { jobType },
    });
  }
}

export class InvalidScheduleError extends StynxJobsError {
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Invalid schedule: ${reason}`, {
      code: 'SCHEDULE_INVALID',
      status: 400,
      ...(context ? { context } : {}),
    });
  }
}

export class InvalidJobInputError extends StynxJobsError {
  constructor(reason: string, context?: Record<string, unknown>) {
    super(`Invalid job input: ${reason}`, {
      code: 'JOB_INPUT_INVALID',
      status: 400,
      ...(context ? { context } : {}),
    });
  }
}

export class InvalidCronExpressionError extends StynxJobsError {
  constructor(expression: string) {
    super(`Invalid cron expression: ${expression}`, {
      code: 'CRON_EXPRESSION_INVALID',
      status: 400,
      context: { expression },
    });
  }
}
