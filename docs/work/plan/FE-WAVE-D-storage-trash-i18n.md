# FE-WAVE-D — Storage Complete, Trash Default Adapter, i18n End-to-End

**Wave goal.** Complete the storage surface (download, multipart, scan callback), ship a default trash adapter with bulk operations, and migrate every `packages-web/*` template to use `@stynx-web/angular-i18n` with shipped per-package catalogs and ICU support.

## Scope

### Storage

| Item                          | API                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `StynxDocumentDownloadComponent` | `<stynx-document-download [documentId]>` — button + progress UI; resolves signed URL; triggers save. |
| `MultipartUploadExecutor`     | New implementation of `STYNX_UPLOAD_EXECUTOR`; chunks files > `chunkThreshold`; resumable.            |
| `DocumentService.scanStatus$` | `Observable<ScanEvent>` per `documentId`; long-polls or websocket'd, abstracted via the SDK.       |
| Drag-and-drop                 | `StynxDocumentUploadComponent` accepts `enableDragAndDrop` input; renders a dropzone.              |

### Trash

| Item                              | API                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SdkTrashAdapter`                 | Default; multiplexes across known soft-deletable kinds (`record`, `work-item`, `document`).            |
| `provideStynxTrash(...)`          | Standalone provider; uses `SdkTrashAdapter` by default.                                                |
| Polish to `StynxTrashListComponent` | Bulk-select, bulk-restore, bulk-hard-delete, retention countdown, per-kind tabs, filter chips.        |

### i18n

| Item                                            | API / file                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `TranslatePipe` ICU upgrade                     | Detect ICU MessageFormat syntax; call `intl-messageformat` library; cache compiled formatters per key+locale. |
| `StynxIntlDatePipe`, `StynxIntlNumberPipe`, `StynxIntlCurrencyPipe` | New pipes that bind to the active locale signal.                                                              |
| Per-package translation catalogs                | `packages-web/<pkg>/src/i18n/{en,pt-BR}.json` for every package that ships templates.                          |
| Extraction tool                                 | `tools/i18n-extract.mjs` — scans templates + TS for `| translate` / `i18n.translate('...')` calls; emits key list.   |
| Lint                                            | `pnpm i18n:check` script: fails if any template has an English literal in a known UI position.               |

## Workstreams

### D.1 — `StynxDocumentDownloadComponent`

Standalone, `OnPush`, signals for progress. Uses `DocumentService.getSignedUrl(id)` then `fetch` with stream + `<a download>`. Emits `progress` and `downloadComplete`.

### D.2 — `MultipartUploadExecutor`

Implements `STYNX_UPLOAD_EXECUTOR`. Algorithm:
- If `file.size <= chunkThreshold` (default 16 MiB): single PUT (delegate to `XhrUploadExecutor`).
- Else: `POST /storage/uploads/initiate-multipart` → receives chunk URLs; PUT chunks in parallel with retry; `POST /storage/uploads/complete-multipart`.
- Resume: on retry, query `GET /storage/uploads/{uploadId}` for completed chunks.

### D.3 — Drag-and-drop and scan-status

`StynxDocumentUploadComponent` accepts an `enableDragAndDrop` input. `DocumentService.scanStatus$(documentId)` mirrors a backend channel (long-poll `GET /storage/documents/{id}/scan-status`).

### D.4 — `SdkTrashAdapter` + bulk operations

`SdkTrashAdapter` consumes `GET /trash?kind=...` per kind, multiplexes results. `restore(id, kind)`, `hardDelete(id, kind)`. `bulkRestore(ids)`, `bulkHardDelete(ids)`.

`StynxTrashListComponent` polish: tab strip per kind, bulk-action toolbar, retention countdown via a per-row `Intl.RelativeTimeFormat` pill, filter chips ("last 7 days", "by me", "by-actor").

### D.5 — `TranslatePipe` ICU upgrade

Add `intl-messageformat` as a runtime peer dep of `@stynx-web/angular-i18n`. Update `TranslatePipe.transform(key, params?)` to detect ICU and call the formatter; cache by `key+locale`.

### D.6 — `Intl` pipes

`StynxIntlDatePipe`, `StynxIntlNumberPipe`, `StynxIntlCurrencyPipe`. Each `inject(I18nService)` and reads `localeState()`. Pure pipes won't re-run on signal change; use signal-aware pipes (Angular 20 `pipe: signal-aware` or wrap as a computed signal helper).

### D.7 — Per-package translation catalogs

For every package shipping templates:

```
packages-web/<pkg>/src/i18n/
  en.json
  pt-BR.json
```

Migrate every template literal to `{{ 'pkg.feature.key' | translate }}`. The key namespace is the package name (`auth`, `iam`, `profile`, `flow`, `audit`, `storage`, `trash`, `tenancy`, `ui`).

### D.8 — Extraction tool

`tools/i18n-extract.mjs` — walks `packages-web/*/src` for `| translate`, `i18n.translate('...')`, and `*.component.html` literal-strings inside `>...<` positions. Emits:
- `packages-web/<pkg>/src/i18n/keys.json` — the canonical key list.
- A diff against `en.json` (missing or stale keys).

Add `pnpm i18n:check` and `pnpm i18n:extract` workspace scripts.

### D.9 — Tests

- `StynxDocumentDownloadComponent` TestBed spec — progress and error paths.
- `MultipartUploadExecutor` spec — single + multipart + resume cases against a mocked transport.
- `SdkTrashAdapter` spec — list / restore / bulk semantics.
- `TranslatePipe` ICU spec — `'You have {count, plural, one {1 task} other {# tasks}}'`.
- `Intl` pipes specs.
- Mutation passes the configured repository threshold for the package under test.

(Playwright in FE-WAVE-G.)

## Success criteria

1. `StynxDocumentDownloadComponent`, `MultipartUploadExecutor`, drag-and-drop, scan-status are shipped.
2. `SdkTrashAdapter` + bulk ops + retention countdown + per-kind tabs are shipped.
3. `TranslatePipe` handles ICU pluralisation.
4. `Intl` date / number / currency pipes shipped in `@stynx-web/angular-i18n`.
5. Every `packages-web/*` template literal in user-visible position is now translatable.
6. `en` + `pt-BR` catalogs shipped per package with templates.
7. `pnpm i18n:check` passes; `pnpm i18n:extract` reproduces the catalog from source.
8. `pnpm test:matrix` records the new tests; mutation passes the configured repository threshold per package.

## Closure artifact

`docs/work/plan/FE-WAVE-D-report.md`.

## Role routing

| Workstream | Authority |
| ---------- | --------- |
| D.1–D.4 storage + trash | Engineer |
| D.5–D.6 i18n runtime | Engineer |
| D.7 catalog migration | Engineer (per-package) |
| D.8 extraction tool | Engineer (under `tools/`) |
| D.9 tests | Inspector |
| ADR for ICU adoption + extraction strategy | Architect |
