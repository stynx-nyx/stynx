# Schemas

This directory is the canonical, Architect-owned STYNX schema corpus. The
HTTP error-envelope schema is consumed by runtime and documentation tooling;
generated documentation is a published view, never a second authority.

`outbox-retirement.schema.json` defines the minor-release retirement input and
JSON receipt. Service `Date` values serialize as ISO instants; runtime/SQL also
enforce the documented UTF-8 byte bounds. Retirement never proves delivery.

`offline-import.schema.json` defines the closed eleven-kind storage DTO union,
exact primary-key mappings and archived-response envelope for owner-only import.
The import contract additionally requires byte bounds, legal-JSON/canonical
digest validation, lossless timestamp/bigint handling and cross-record invariants;
schema validity alone is not an import or archive-verification pass.

Raw offline import text enters through exported `parseOfflineImportManifest`,
which detects duplicate decoded object names before closed validation. A schema
validator applied to an already parsed object cannot recover discarded keys;
object import still validates independently and performs the live checks.

`http-api-compositions.schema.json` defines the closed declaration-alternative and
published operation-ID compatibility registry in
`law/policy/http-api-compositions.json`. Exact source/controller/method/path
membership, immutable 1.5.7 provenance, uniqueness, complete variant coverage and
source/mounted/OpenAPI agreement are additional semantic obligations. This
registry is not evidence that a runtime composition was mounted or measured.
