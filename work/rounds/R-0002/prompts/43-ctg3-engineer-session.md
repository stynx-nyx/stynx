# Engineer — CTG-0003 session implementation

Role Engineer. Start only after Inspector B sensors are committed by
the maestro. Follow the reviewed public contract in
`docs/framework/contracts/authorization-session-1.5.md`. Implement
UPS-SES-01…03 in sessions and auth. Optional single-session policy is
atomic per user+tenant in Redis and in-memory stores; no list-then-
create race or process-local lock. Match strong-factor policy only
against validated claims or a server-derived marker from a verified
previous session; never trust client `deviceMeta`. Denial occurs
before any create/revoke. Expose a read-only structural health
indicator. Run focused tests including real Redis integration and
relevant lint/typecheck. Do not edit backend/contracts/angular-auth,
Inspector tests unless reporting sensor error, law, baselines,
changeset or generated files. No shim, copied DETRAN code, Git,
publication, push or PR. Report exact results.
