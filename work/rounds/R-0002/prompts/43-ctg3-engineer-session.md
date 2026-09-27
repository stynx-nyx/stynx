# Engineer — CTG-0003 session implementation

Role Engineer. Start only after Inspector B sensors are committed by
the maestro. Follow the reviewed public contract in
`docs/framework/contracts/authorization-session-1.5.md`. Implement
UPS-SES-01…03 in sessions and auth. Optional single-session policy is
atomic per user+tenant in Redis and in-memory stores; active means
status active and both absolute/idle expiry later than the service
clock. The atomic operation excludes an authenticated prior sid from
conflicts, revokes it together with successful creation, and performs
all existing key/index/refresh effects. No list-then-create race or
process-local lock. `StynxAuthService.switchTenant` passes actor.sid
through its actual `exchangeExistingIdentity` path. Match strong-factor
policy against a configurable claim in validated Cognito claims,
parsing string/array values; carry only a server-derived marker through
chained switches, never client `deviceMeta`. Require the marker only
when strongFactor is enabled. Invalidate permission-cache entries
for prior and all returned revoked sids after commit. Keep new store
methods optional for existing custom stores; opt-in without atomic
support fails at boot. Denial occurs before any create/revoke. Expose
a read-only structural health indicator with
bounded timeout and immediate Redis-not-ready response. Run focused
tests including real Redis integration and
relevant lint/typecheck. Do not edit backend/contracts/angular-auth,
Inspector tests unless reporting sensor error, law, baselines,
changeset or generated files. No shim, copied DETRAN code, Git,
publication, push or PR. Report exact results.
