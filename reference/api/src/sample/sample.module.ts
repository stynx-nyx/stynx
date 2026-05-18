import { Module } from '@nestjs/common';
import { ReferenceDevAuthController } from './reference-dev-auth.controller';
import { ReferenceDevAuthService } from './reference-dev-auth.service';
import { DocumentsController } from './documents.controller';
import { RecordNotesController } from './record-notes.controller';
import { RecordsController } from './records.controller';
import { ReferenceProbesController } from './reference-probes.controller';
import { ReferenceSampleService } from './reference-sample.service';
import { WorkItemEntriesController } from './work-item-entries.controller';
import { WorkItemLocksController } from './work-item-locks.controller';
import { WorkItemsController } from './work-items.controller';

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
