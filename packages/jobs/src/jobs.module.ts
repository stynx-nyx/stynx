import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { STYNX_JOBS_OPTIONS, STYNX_JOBS_REGISTRY } from './constants';
import { JobsRegistry } from './jobs.registry';
import { JobsRepository } from './jobs.repository';
import { JobsService } from './jobs.service';
import { JobsScheduler } from './jobs.scheduler';
import { JobsWorker } from './jobs.worker';
import type { StynxJobsModuleOptions } from './types';

@Module({})
export class StynxJobsModule {
  static forRoot(options: StynxJobsModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [{ provide: STYNX_JOBS_OPTIONS, useValue: options }, JobsRegistry, JobsRepository, JobsService, { provide: JobsWorker, useFactory: (repository: JobsRepository, registry: JobsRegistry) => new JobsWorker(repository, registry, options.worker), inject: [JobsRepository, JobsRegistry] }, { provide: JobsScheduler, useFactory: (repository: JobsRepository) => new JobsScheduler(repository, options.scheduler), inject: [JobsRepository] }, { provide: STYNX_JOBS_REGISTRY, useExisting: JobsRegistry }];
    for (const [type, handler] of Object.entries(options.handlers ?? {})) providers.push({ provide: `STYNX_JOB_HANDLER_${type}`, useFactory: (registry: JobsRegistry) => registry.register(type, handler), inject: [JobsRegistry] });
    return { module: StynxJobsModule, providers, exports: [JobsService, JobsRegistry, JobsWorker, JobsScheduler, STYNX_JOBS_REGISTRY] };
  }
}
