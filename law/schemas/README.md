# Schemas

This directory is the canonical, Architect-owned STYNX schema corpus. The
HTTP error-envelope schema is consumed by runtime and documentation tooling;
generated documentation is a published view, never a second authority.

`outbox-retirement.schema.json` defines the minor-release retirement input and
JSON receipt. Service `Date` values serialize as ISO instants; runtime/SQL also
enforce the documented UTF-8 byte bounds. Retirement never proves delivery.

`offline-import.schema.json` defines the closed versioned storage DTO union
(eleven kinds under `/1`, additively twelve under `/2`),
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

`http-qualification-batch.schema.json` binds the prospective serial coordination
policy. `http-qualification-batch-evidence.schema.json` closes journal, attempt
archive and derived batch-index records. Actual trusted origin, complete artifact
closure, legal transitions, per-case acceptance and resume credit are additional
semantic obligations; schema validity and journal self-hashes confer no authority.

`finite-k6-derivative.schema.json` closes the exact prospective supplemental
generator identity, source/build/control pins and preserved profile boundary.
Its diagnostic build declarations do not supply actual task/native admission,
real-time calibration, application floors or readiness.

`release-scope-1.6.0.schema.json` validates the exact one-version bounded
publication policy under ADR-RELEASE-0001. It preserves the full fifteen-node RC,
requires verified-local-rc at publication and declares HTTP/k6 NOT_OBSERVED,
mutation NOT_RUN and non-promoting audit standing. Schema validity alone grants
neither a candidate receipt nor publication success.

`release-scope-1.6.1.schema.json` separately validates the exact prospective
1.6.1 scope under ADR-RELEASE-0004. The 1.6.0 scope remains immutable. Both retain
all fifteen signed RC nodes and truthful unobserved HTTP/mutation standing;
neither schema validity nor audit greenness establishes publication success.

`release-scope-1.6.2.schema.json` validates the prospective audit-tranche
patch under ADR-RELEASE-0005. It retains the fifteen-node signed RC and
non-promoting standing without running k6 or mutation tests. Its exact
descriptor and schema identities must be independently rebound before use.
