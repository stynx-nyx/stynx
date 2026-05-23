# Storage Agent Working Note

## Scope

Inspected object-storage presign flows and document metadata abstractions in:

- `porm`
- `pec`
- `sgp`
- `stynx`

Evidence source was code/DDL only (no inferred business semantics).

## Files Inspected (with symbols)

### porm

- `porm/backend/src/core/storage/storage.service.ts`
  - `StorageService.presignUpload`
  - `StorageService.presignDownload`
  - `StorageService.publicUrlFor`
  - `StorageService.deleteObject`
  - `StorageService.info`
- `porm/backend/src/core/storage/cms-storage.controller.ts`
  - `CMSStorageController.presignUpload`
  - `CMSStorageController.presignDownload`
  - `CMSStorageController.publicUrl`
  - `CMSStorageController.delete`
- `porm/backend/src/porm/storage/porm-storage.controller.ts`
  - `PormStorageController.presignUpload`
  - `PormStorageController.presignDownload`
  - `PormStorageController.publicUrl`
  - `PormStorageController.delete`
- `porm/backend/src/core/storage/cms-document-record.service.ts`
  - `CMSDocumentRecordService.createDocumentRecord`
  - `CMSDocumentRecordService.insertCmsDocument`
- `porm/backend/src/porm/storage/porm-document-record.service.ts`
  - `PormDocumentRecordService.createDocumentRecord`
  - `PormDocumentRecordService.insertPormDocument`
- `porm/backend/src/core/storage/dto/create-document.dto.ts`
  - `CreateDocumentDto.domain`
- `porm/backend/src/core/storage/storage.module.ts`
  - `StorageModule` (`@Global`, exports `StorageService`)
- `porm/database/cms/ddl.sql`
  - `CREATE TABLE cms.document`
- `porm/database/porm/ddl.sql`
  - `CREATE TABLE porm.document`
- `porm/database/cms/rls.sql`
  - `cms_document_public_select`, `cms_document_private_select`, `cms_document_insert`, `cms_document_update`, `cms_document_delete`
- `porm/database/porm/rls.sql`
  - `porm_document_public_select`, `porm_document_private_select`, `porm_document_insert`, `porm_document_update`, `porm_document_delete`

### pec

- `pec/src/storage/storage.service.ts`
  - `StorageService.presignUpload`
  - `StorageService.presignDownload`
  - `StorageService.keyFromStorageUri`
  - `StorageService.publicUrlFor`
- `pec/src/storage/storage.controller.ts`
  - `StorageController.presignUpload`
  - `StorageController.presignAndCreate`
  - `StorageController.presignDownload`
  - `StorageController.publicUrl`
- `pec/src/pec/documents/documents.service.ts`
  - `DocumentsService.list`
  - `DocumentsService.create`
  - `DocumentsService.getById`
  - `DocumentRow`
- `pec/src/@core/config/configuration.ts`
  - `storageConfig`
- `pec/src/pec/documents/dto/create-document.dto.ts`
  - `CreateDocumentDto.storageUri`, `CreateDocumentDto.sha256`
- `pec/database/ddl/02-pec.sql`
  - `CREATE TABLE pec.documents`
- `pec/database/ddl/21-auth-policies.sql`
  - `auth.create_rls_policy`
- `pec/database/ddl/22-pec-policies.sql`
  - `SELECT auth.create_rls_policy('pec','documents')`

### sgp

- `sgp/source/backend/src/documents/documents-storage.service.ts`
  - `DocumentsStorageService.createPresignedUpload`
  - `DocumentsStorageService.createPresignedDownload`
  - `DocumentsStorageService.ensureObjectExists`
  - `DocumentsStorageService.configured`
- `sgp/source/backend/src/documents/documents.service.ts`
  - `DocumentsService.presignUpload`
  - `DocumentsService.registerUpload`
  - `DocumentsService.presignDownload`
  - `DocumentsService.buildStorageKey`
  - `DocumentsService.ensureStorage`
- `sgp/source/backend/src/documents/documents.controller.ts`
  - `DocumentsController.presignUpload`
  - `DocumentsController.registerByPath`
  - `DocumentsController.presignDownload`
- `sgp/source/backend/src/documents/documents.dto.ts`
  - `PresignUploadRequestDto`
  - `PresignedUploadDto`
  - `RegisteredDocumentDto`
- `sgp/source/backend/src/config/environment.ts`
  - `ValidatedEnvironment` S3 fields
  - `validateEnvironment` S3 derivation/defaults
- `sgp/source/backend/prisma/migrations/20260417120000_initial_sgp/migration.sql`
  - `CREATE TYPE "DocumentStorageKind"`
  - `CREATE TABLE "document_attachment"`
  - `CREATE TABLE "document_download_audit"`
- `sgp/source/backend/prisma/migrations/20260418130000_document_upload_session/migration.sql`
  - `CREATE TYPE "DocumentUploadStatus"`
  - `CREATE TABLE "document_upload_session"`

### stynx

- `stynx/backend/src/core/storage/storage.service.ts`
  - `StorageService.listFiles`
  - `StorageService.registerFile`
  - `StorageService.markDeleted`
- `stynx/backend/src/core/storage/storage.controller.ts`
  - `StorageController.list`
  - `StorageController.create`
  - `StorageController.delete`
- `stynx/backend/src/core/storage/dto/register-file.dto.ts`
  - `RegisterFileDto`
- `stynx/database/ddl/03-storage.sql`
  - `CREATE TABLE storage.files`
  - `metadata jsonb`
  - `tenant_scope` RLS policy
- `stynx/docs/stynx/release-readiness.md`
  - `Wire real storage upload flow (presigned URLs)`

## Shared Object Storage Boundaries

1. Adapter/service boundary for object storage exists in 3 repos:

- `porm`: `StorageService` (`porm/backend/src/core/storage/storage.service.ts`)
- `pec`: `StorageService` (`pec/src/storage/storage.service.ts`)
- `sgp`: `DocumentsStorageService` (`sgp/source/backend/src/documents/documents-storage.service.ts`)

2. Presign upload/download HTTP boundaries:

- `porm`: `CMSStorageController.presignUpload`, `CMSStorageController.presignDownload`, `PormStorageController.presignUpload`, `PormStorageController.presignDownload`
- `pec`: `StorageController.presignUpload`, `StorageController.presignAndCreate`, `StorageController.presignDownload`
- `sgp`: `DocumentsController.presignUpload`, `DocumentsController.registerByPath`, `DocumentsController.presignDownload`

3. Key-shape boundary differences are explicit:

- `porm` key format from `StorageService.presignUpload`: `${env}/${domain}${idSeg}/${randomUUID()}${ext}`
- `pec` key format from `StorageService.presignUpload`: `${envPrefix}/${prefix}/${randomUUID()}${ext}`
- `sgp` key format from `DocumentsService.buildStorageKey`: `${keyPrefix}/${ownerType}/${stamp}/${documentId}-${safeName}`
- `stynx` runtime does not generate storage keys; `RegisterFileDto.objectKey` is caller-supplied.

4. Public URL boundary differs:

- `porm`: `StorageService.publicUrlFor` supports `S3_PUBLIC_ENDPOINT` / `S3_FORCE_PATH_STYLE` branch logic.
- `pec`: `StorageService.publicUrlFor` returns AWS virtual-host URL (`us-east-1` special case).
- `sgp`: no public URL endpoint in documents controller; download path is presigned (`DocumentsController.presignDownload`).

## Metadata Repository Interface Boundaries

1. `porm` metadata writes are separated from presign adapter by document-record services:

- `CMSDocumentRecordService.createDocumentRecord` -> insert into `cms.document`
- `PormDocumentRecordService.createDocumentRecord` -> insert into `porm.document`
- Controllers call both storage presign + record service in one flow.

2. `pec` metadata repository abstraction is service-level (no dedicated repository interface/class found):

- `DocumentsService.create/list/getById` persists and reads `pec.documents`.
- `StorageController.presignAndCreate` composes presign + `DocumentsService.create`.

3. `sgp` metadata is split across staged + final registries:

- staged upload metadata: `public.document_upload_session` via `DocumentsService.presignUpload`
- finalized attachment metadata: `public.document_attachment` via `DocumentsService.registerUpload`
- download audit metadata: `public.document_download_audit` via `DocumentsService.presignDownload`

4. `stynx` currently exposes metadata registry only:

- `StorageService.registerFile/listFiles/markDeleted` over `storage.files`
- no runtime presign storage adapter in backend storage module.

## Exclusions

- Did not use frontend files for flow inference.
- Did not use historical patch archives as active runtime evidence.
- Did not use broad docs/spec narratives as source of truth where executable code/DDL existed.
- Did not extract domain/business document semantics; only storage and metadata technical boundaries were captured.

## Migration Risks (evidence-backed)

1. Metadata field model mismatch across repos.

- `porm`: `s3_key` in `cms.document` / `porm.document`.
- `pec`: `storage_uri` (`s3://...`) in `pec.documents`.
- `sgp`: `storage_key` + `storage_kind` in `document_attachment`, plus `storage_bucket` in `document_upload_session`.
- `stynx`: `bucket` + `object_key` in `storage.files`.

2. Presign lifecycle mismatch.

- `porm` and `pec` can persist metadata at presign time (e.g., `CMSStorageController.presignUpload`, `StorageController.presignAndCreate`).
- `sgp` requires staged session then explicit register (`DocumentsController.registerByPath` + `DocumentsService.registerUpload`).
- `stynx` has no implemented backend presign flow in this working-note snapshot.

3. Upload header/ACL contract mismatch.

- `pec` includes ACL path (`PutObjectCommand` with `ACL: 'public-read'`) and requires `x-amz-acl` for public uploads.
- `porm` public/private decision is metadata + URL resolution path; no ACL header emission in `requiredHeaders`.
- `sgp` required headers from `DocumentsStorageService.createPresignedUpload` currently only include `content-type`.

4. Authorization/RLS behavior mismatch around private metadata reads.

- `porm` has explicit document RLS policy sets in both `cms` and `porm` schemas.
- `pec` applies generic tenant policy generation via `auth.create_rls_policy` for `pec.documents`.
- `sgp` gates controller actions with permission guards and writes DB request context in `DatabaseService.applySessionContext`; no table-level RLS policy set inspected in the Prisma migrations for document tables.
- `stynx` uses `tenant_scope` policy on `storage.files`.

5. Key namespace strategy mismatch.

- `porm` key namespace is domain enum (`venture|content|opportunity|proposal|engagement`).
- `pec` namespace is free-form `prefix`.
- `sgp` namespace is ownerType + date + documentId/safeName convention.
- `stynx` accepts arbitrary `objectKey` from client payload.
