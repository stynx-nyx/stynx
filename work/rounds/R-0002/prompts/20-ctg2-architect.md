# Architect — CTG-0002 SSE public contract

Role: Architect. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Read `AGENTS.md`, then README,
constitution/pin, ADR, schemas and development contract in authority
order; read DETRAN C-0002 §4/§7/§8 only (do not write there), the local
`ctg-0002-plan.md`, and the current backend, data, core and Angular
public surfaces. Edit only
`docs/framework/contracts/sse-1.5.md` and, if needed, the CTG-specific
plan file. No source/tests/generated files/law/workflows.

Fix the actual public names, types, injection boundary and wire
contract for all UPS-SSE-01…10, UPS-NGSSE-01…10 and UPS-TEST-01. The
backend must accept a structural `withRequestContext` port, because
core.Database lacks it and data.Database has it. The outbox upsert
model cannot be called a replay log. Document the configured Angular
HttpClient/interceptor prerequisite, actual tenant/session signals,
and the existing empty angular/testing secondary entry. Make the two
tenant PostgreSQL/RLS proof and all negative states unambiguous.
Fix `sessionActive: Signal<boolean>` as a required app-supplied config
port, avoiding an angular→angular-auth cycle. Specify an SSE
`HttpContextToken`: ErrorInterceptor keeps status/Retry-After and
suppresses banners; AuthInterceptor refresh/replay precedes terminal
401 stop. Bind E2E to reference/api test:int with non-superuser role,
no tenant WHERE and no inherited tick ALS. Fix port/scope generics,
HTTP preflight order/errors, flush/buffering, metrics sink and the
canonical angular/testing entry.

Report concrete symbols and file/line evidence. Do not execute Git,
commit, push, publish, open PR or write DETRAN.
