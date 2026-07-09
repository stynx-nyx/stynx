# LGPD Erasure

Execute live and archive erasure for data subjects through `@stynx-nyx/privacy`.

## Steps

- Confirm the lawful basis and approved request id.
- Run the privacy export first so the requester can review known data.
- Invoke the erasure workflow with the data subject and tenant scope.
- Verify live tables and archive mirrors apply the configured PII strategy.
- Confirm linked object-store references are deleted through `@stynx-nyx/storage`.

## Verification

- `lgpd_erasure_total` increments for every affected table and strategy.
- Audit rows include LGPD tags and retention metadata.
- PII map entries have no unprocessed rows for the request scope.
- Object-store probes return not found for erased blobs.

## Rollback

- LGPD erasure is intentionally irreversible. If the wrong subject was processed, open an incident and restore only from legally approved backups.
