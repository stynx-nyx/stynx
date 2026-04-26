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

@Module({
  controllers: [
    RecordsController,
    RecordNotesController,
    DocumentsController,
    ReferenceProbesController,
    ReferenceDevAuthController,
    WorkItemsController,
    WorkItemEntriesController,
    WorkItemLocksController,
  ],
  providers: [ReferenceSampleService, ReferenceDevAuthService],
  exports: [ReferenceSampleService, ReferenceDevAuthService],
})
export class SampleModule {}
