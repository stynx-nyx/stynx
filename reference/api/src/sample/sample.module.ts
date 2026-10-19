import { Module } from '@nestjs/common';
import { ReferenceDevAuthController } from './reference-dev-auth.controller.js';
import { ReferenceDevAuthService } from './reference-dev-auth.service.js';
import { DocumentsController } from './documents.controller.js';
import { RecordNotesController } from './record-notes.controller.js';
import { RecordsController } from './records.controller.js';
import { ReferenceProbesController } from './reference-probes.controller.js';
import { ReferenceSampleService } from './reference-sample.service.js';
import { WorkItemEntriesController } from './work-item-entries.controller.js';
import { WorkItemLocksController } from './work-item-locks.controller.js';
import { WorkItemsController } from './work-items.controller.js';

function normalizedEnvironment(): string {
  return (process.env.NODE_ENV ?? process.env.STYNX_ENVIRONMENT ?? 'development')
    .trim()
    .toLowerCase();
}

export function isReferenceDevAuthEnabled(): boolean {
  const environment = normalizedEnvironment();
  return environment !== 'production' && environment !== 'prod';
}

const referenceDevAuthControllers = isReferenceDevAuthEnabled() ? [ReferenceDevAuthController] : [];
const referenceDevAuthProviders = isReferenceDevAuthEnabled() ? [ReferenceDevAuthService] : [];

@Module({
  controllers: [
    RecordsController,
    RecordNotesController,
    DocumentsController,
    ReferenceProbesController,
    ...referenceDevAuthControllers,
    WorkItemsController,
    WorkItemEntriesController,
    WorkItemLocksController,
  ],
  providers: [ReferenceSampleService, ...referenceDevAuthProviders],
  exports: [ReferenceSampleService, ...referenceDevAuthProviders],
})
export class SampleModule {}
