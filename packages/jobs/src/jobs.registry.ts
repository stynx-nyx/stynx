import { Injectable } from '@nestjs/common';
import { DuplicateJobTypeHandlerError, UnknownJobTypeError } from './errors';
import type { JobHandler } from './types';

@Injectable()
export class JobsRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(jobType: string, handler: JobHandler): void {
    if (!jobType.trim()) throw new UnknownJobTypeError(jobType);
    if (this.handlers.has(jobType)) throw new DuplicateJobTypeHandlerError(jobType);
    this.handlers.set(jobType, handler);
  }

  get(jobType: string): JobHandler {
    const handler = this.handlers.get(jobType);
    if (!handler) throw new UnknownJobTypeError(jobType);
    return handler;
  }
}
