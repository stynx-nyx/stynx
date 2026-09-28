# CTG-0005 — transactional audit and idempotency

**Current role:** Architect. **State:** Opus prompt-review cycle 3 returned PASS on the behavioral contract. OD-S15-02 replaces intermediate PR/RC/full-CI cadence; the revised flow prompt-review and predecessor reconciliation precede Inspector dispatch. **Topological predecessors:** CTG-0003 authz/session and CTG-0004 jobs. **Source:** DETRAN C-0002 §6.2 (read only), UPS-TXN-01…05, all MUST under OD-S15-01.

## Boundary and locks

The proposed reference is `docs/framework/contracts/transactional-audit-idempotency-1.5.md`. Owned paths: `packages/contracts`, `packages/audit`, `packages/backend` (audit and new command boundary plus `package.json`), `packages/idempotency`, `packages/data`, the narrow `packages/tenancy` read-only command-provenance port and `packages/auth` built-in guard brand, platform migration `0020_transactional_commands.sql`, canonical `database/ddl`/seed, `test/db`, affected reference consumers and fixed-group changeset. The unexported `packages/backend/src/idempotency` duplicate is untouched. CTG-0005 does not own CTG-0004 schedule or worker behavior. Avoid simultaneous `packages/data`, shared RLS fixtures or manifest edits. Declare separate `(F1, transaction)`, `(F3, backend/audit/contracts/idempotency/data/tenancy/auth)`, and `(F2, same package paths)` semantic locks; release at role boundaries. The Architect contract, Inspector tests and Engineer implementation use separate commits.

The concrete exported name for the reviewed contracts-level guard brand is `STYNX_BUILTIN_AUTH_GUARD`; its own-property `=== true` constructor semantics are fixed by the PASS contract. Inspector and Engineer use this spelling consistently.

### Predecessor dispatch gate

Inspector prompt 61 is **released** for red-test dispatch. The first amendment at `c469b6f8` received REVIEW in `reviews/ctg5-predecessor-reconciliation-review-1.raw.json`; the second amendment at `42c069b9` received REVIEW in `reviews/ctg5-predecessor-reconciliation-review-2.json`. The repaired contract is commit `ae27eb5f3f9507da9acf645ad923dae7fdb91e34`, and the independent Opus 5.5 cycle-3 receipt `reviews/ctg5-predecessor-reconciliation-review-3.json` is **PASS** with its bridge receipt beside it. Two LOW wording suggestions about `APP_GUARD` are advisory; the explicit exclusion of imperative `app.useGlobalGuards` governs implementation. CTG-0003 is merged in `main` `48b42874`; CTG-0004 is implemented at `3a69785a` with final delivery-review PASS, but has no PR by OD-S15-02. The cumulative CTG5 worktree was rebased onto CTG4 PASS HEAD `3a69785a2b43bcaed3f42f1cd65e954100eb4f6e` (merge-base verified by the maestro); its reviewed actor-provenance contract HEAD is `ae27eb5f3f9507da9acf645ad923dae7fdb91e34`. No CTG4 merge into `main` is required. This branch's old `a3c81645` base was insufficient.

| CTG                | Frozen contract source SHA; implementation SHA                                                                                                                                                                                               | Cross-family PASS receipts                                                                                                                                                   | Cumulative campaign HEAD                   | State              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------ |
| 0003 authz/session | `authorization-session-1.5.md` last changed at `d17b849e768550366ceb2e88baee815ed9aa5786`; merged implementation `48b42874a3a660e648e1567b36da8d71668185a0`                                                                                  | `reviews/ctg3-prompt-review-2.json`; `reviews/ctg3-postrc2-repair-delivery-review.json` and `reviews/ctg3-coverage-delivery-review.json` in R-0002 conformance worktree      | `3900c383ce7cea706a1b0995ac1bd01b5b462cad` | PASS; tree present |
| 0004 jobs          | `jobs-actor-timezone-1.5.md` last changed at `3a69785a2b43bcaed3f42f1cd65e954100eb4f6e`; `jobs-ctg4-sparse-and-poison-schedules.md` at `d99e597f5d31e34ad068ed0e9af80fca1447168d`; implementation `3a69785a2b43bcaed3f42f1cd65e954100eb4f6e` | `reviews/ctg4-prompt-review-5.json`, `reviews/ctg4-followup-prompt-review-3.json`, and `reviews/ctg4-final-delivery-review-2.json` (last two in R-0002 conformance worktree) | `3900c383ce7cea706a1b0995ac1bd01b5b462cad` | PASS; tree present |

After both predecessors are integrated, the Architect must compare the frozen CTG-0003/0004 contracts and implemented behavior with this contract's assumptions: `RequestContext.actorId` as trusted default scope, the configured nominal or verified actor on a public route, and nested command transaction role/tenant/actor constraints. Record that reconciliation here with source SHAs before Inspector dispatch. If any assumption changes, amend the contract and obtain a new cross-family prompt-review PASS on the amended version. A predecessor row alone is insufficient.

### Architect predecessor reconciliation checkpoint — 2026-09-28

The CTG3/4 source tree is available at the cumulative HEAD above. CTG3's authorization/session contract establishes a verified tenant marker for guard-time policy evaluation; it does **not** make every `RequestContext.actorId` inherently authenticated. The preceding tenancy contract and `TenantContextInterceptor` establish Host-selected public tenant and configured nominal or verified actor. `RequestContextInterceptor` also patches actor from request-local `stynxClaims`, `principal`, `actor`, or `user`, while plain legacy `@Public()` retains an unverified-claim fallback. The repaired CTG5 amendment therefore uses `request.principal.id` as the built-in protected principal, checks any `stynxClaims` against it and the guard marker, and requires a built-in guard brand at boot for protected and optional-auth public commands. `AuthContextGuard` clears pre-seeded claims; the `StynxAuthGuard` brand is the only narrow `packages/auth` change. A same-named look-alike guard does not satisfy the brand. The guard check uses route/class metadata and actual `APP_GUARD` providers only. Imperative `app.useGlobalGuards`, even before `app.init()`, is unsupported for command provenance because Nest exposes no public DI registry for it. A concrete guard constructor must own the contracts brand; a same-named look-alike or subclass merely inheriting it fails. Deliberate self-branding is inside the trusted application-code boundary. No relative APP_GUARD order is added.

`@stynx-nyx/contracts` defines one read-only `STYNX_RESOLVED_TENANT_COMMAND_CONTEXT` DI port backed by a private request-keyed WeakMap in `packages/tenancy`. The injected provider has only `get()` on its own object/prototype; a module-scoped write function is inaccessible through that provider and not exported. `TenantContextInterceptor` writes a `protected`, `nominal` or `verified` result only after its existing successful checks and RequestContext patch, immediately before `next.handle()`. On protected routes it retains the exact actor used by the existing membership lookup and attests only if that actor equals `principal.id` and the patched RequestContext actor; otherwise no result is written. On verified public routes the actor must equal `principal.id`, and any claims must match that principal and the Host tenant. Thus the core → command → tenancy order gives no completion result and fails before command SQL on protected and public routes. Auth-only apps without tenancy require guard marker/principal/context equality and fail before command SQL if core context is incomplete. The command boundary also checks the actual app connection role, tenant and actor before invoking the handler. Plain `@Public()`, `@System()`, raw request fields and `scope: () => 'public'` supply no command authority. Non-HTTP use of the command interceptor is rejected; CTG4 jobs handlers may use `Database.tx` under their persisted actor context without this HTTP decorator. The `42c069b9` review confirmed F1–F6 but identified N1–N4; revision `ae27eb5f` resolved them and received PASS in `reviews/ctg5-predecessor-reconciliation-review-3.json`.

CTG4's `jobs-actor-timezone-1.5.md`, its sparse/poison supplement, `packages/jobs/src/jobs.service.ts`, `jobs.repository.ts`, and `jobs.worker.ts` are consistent with CTG5's actor-bearing app-role execution assumption. Tenant-facing jobs require active tenant and actor context, tenant match and active membership; assignment of another technical actor requires the application callback. Queue claim/outcome control alone uses owner/system context. `executeHandler` leaves system context, opens the persisted tenant/actor `RequestContext`, rechecks active membership, and calls the handler, whose `Database.tx()` uses app role and FORCE RLS. Missing or inactive actor goes to dead letter without handler invocation or retry. A transactional command invoked inside such a handler may use that persisted actor only under the same active app-role connection and CTG5's `requireActor` checks.

Current `packages/data/src/database.ts` resolves tenant and actor for app transactions and sets transaction-local `app.role`, `app.tenant_id`, and `app.actor_id`, but its nested branch creates a savepoint and labels a new `Transaction` with the requested role without checking the live connection's role or identity. `TxOptions` has no `requireActor`. Thus CTG5's nested role/tenant/actor verification is a required additive implementation, not predecessor behavior already present. It must reject a command nested on an owner/reader connection or with a different tenant/actor before SQL, while preserving unrelated legacy savepoints. Its outer command transaction remains one app-role client with `retry:false`; `packages/data/src/database.ts` honors that option. The existing `AuditInterceptor` writes after handler emission and catches sink failures, while `DatabaseIdempotencyStore` opens separate owner transactions and the legacy idempotency interceptor persists `<500` responses with its 422 mismatch; the new command boundary must opt in without changing those legacy routes. Migration 0020 remains required for the app-role audit wrapper, command key identity and privileges. The CTG5 contract's committed marker, Nest 11 method filter emission, scope/fingerprint and 409 rules remain prospective CTG5 behavior; no CTG3/4 source supplies them.

## Baseline and design decisions

- `Database.tx` uses CLS for a live client and savepoints, but its nested branch does not validate requested role or identity against the actual connection. `TxOptions` lacks `requireActor`. The application role already requires tenant and actor.
- `AuditInterceptor` currently writes after handler emission through an independent `AuditSink` and catches/logs write failures.
- `IdempotencyInterceptor` currently has fixed tenant/user/route scope, a hand-rolled stable stringifier, 422 on body mismatch, status `<500` persistence and a Redis path. `DatabaseIdempotencyStore` starts owner-role transactions for reservation and completion. These are not command transaction semantics.
- Choose `@TransactionalCommand`/`StynxTransactionalCommandModule` as the sole boundary, with `@Audit({transactional:true})` and `@Idempotent({transactional:true})` participants. It uses app-role `Database.tx` with `retry:false`; it catches only `CommittedCommandError` inside the transaction. Plain thrown 502 rolls back. Key identity is tenant+scope+supplied key; method and concrete path are fingerprint inputs. App-role audit uses the restricted `audit.write_command_event` wrapper in migration 0020, keeping the hash chain. Cache publication follows commit. Preserve legacy routes by default.

## Coupled work

1. **Architect:** finalize this contract and prompts; after Inspector test paths exist, bind real sensors to applicable existing invariants in `law/trace.json` in an Architect commit. Creating a new invariant needs a separate Owner receipt under the forbidden-action policy. If schema changes are needed, specify them before Engineer migration work. Obtain cross-family prompt PASS before dispatch.
2. **Inspector:** write failing sensors first in `packages/audit/test`, `packages/idempotency/test`, `packages/data/test`, narrow `packages/tenancy/test` and `packages/auth/test` provenance tests, `test/db`, and the Nest HTTP integration harness where PostgreSQL dependencies already exist (`packages/audit/test` or a root integration test). A backend test may require a `devDependency`; route its manifest/lockfile edit to the Engineer after the red sensor is saved. Prove real app-role audit, RLS, rollback, same connection, replay, canonical JSON, route/tenant isolation, 409, status and actor handling, including protected verified actor, nominal and verified public actor, forged request fields, missing provider, and wrong interceptor order. Preserve legacy sensors. Hand back red result/inventory.
3. **Engineer:** implement the approved surface in `packages/contracts`, `packages/audit`, `packages/backend`, `packages/idempotency`, `packages/data`, the read-only provenance port in `packages/tenancy`, and the built-in guard brand in `packages/auth`, with migration 0020, canonical DDL and seeds as applicable. Own required `package.json` and lockfile edits, fixed-group changeset and consumer migration note **within the changeset body or package README**. A separate `docs/meta/migration/` note belongs to Architect in a separate commit. Do not edit tests or law.
4. **Architect maestro:** perform trace and API baseline rebinds in **separate Architect-role commits**; law commits are authored `DEVAI Architect`. **Engineer maestro:** perform package README write/check and implementation commits. Run focused gates and independent delivery-review, then import the role-separated work into the cumulative branch. The one full local CI, PR, remote CI and final publication are deferred until CTG8. No Inspector/Engineer dispatch until the revised prompt-review PASS, both predecessor rows above, and the reconciliation checkpoint are complete.

## Verification and release evidence

Run focused unit, integration and real database tests, `pnpm check:rls-negative`, `pnpm check:rls-smoke`, API baseline comparison, `pnpm check:trace`, and the affected package build/typecheck/lint. Do not run full `pnpm ci:stynx` or reference-consumer CI for this CTG alone; they are one consolidated final gate after CTG8. Record transaction role and connection proof, exact red/green commands, DDL/seed/test disposition, migration application from empty database, conformance mapping of UPS-TXN-01…05 to real symbols and tests, and any explicit uncertainty. No RC publication or CTG-specific PR.

Owner decision 2026-09-27: explicitly authorized the exceptional third prompt-review for CTGs 4–8 in this R-0002 session. This supersedes earlier pending-exception checkpoints. Inspector and Engineer dispatch still require an Opus PASS and all predecessor gates.

Prompt-review cycle 3: `reviews/ctg5-prompt-review-3.json` returned PASS. The Express wire-byte and filter-order clarifications are incorporated; this approval is conditional on CTG-0003/0004 integration and reconciliation before Inspector dispatch.

## Retomada — OD-S15-02

CTG5 está implementada no branch cumulativo derivado do CTG4 PASS
`3a69785a`. Inspector adicionou sensores de PostgreSQL/RLS, HTTP, rollback,
concorrência e `statement_timeout`; Engineer entregou migração 0020 e o limite
transacional; Architect vinculou API/trace. O checkpoint `91db8feb` tem
`pnpm check:trace --print` 428/428 e a árvore limpa. Passaram os testes focais
de backend, integração PostgreSQL, RLS negativo/smoke, baselines públicos,
lint de migração e READMEs. O sensor de timeout passou 9/9 após os gates
focais anteriores. Próximo passo: delivery-review Opus do HEAD exato com
`prompts/64-ctg5-delivery-review.md`; reparar achados se houver, importar a
CTG5 na branch cumulativa e rebater a CTG6 sobre o checkpoint final. Não abrir
PR nem publicar RC nesta CTG.

Delivery-review Opus ciclo 1 em `reviews/ctg5-delivery-review-1.json`
retornou REVIEW no HEAD `91487ae5`. Triagem: `reference-gap` — faltam provas
Nest HTTP/PostgreSQL para comandos públicos nominal/verificado, comando
protegido com port de tenancy, ordem invertida, port ausente e guards falsos;
Inspector acrescenta sensores antes da próxima revisão. Triagem: `plant-bug`
— a checagem de filtros reconhece tipos exatos, mas Nest também captura
superclasses; Inspector fixa as duas ordens de decoradores e Engineer corrige
o bootstrap. Achados não bloqueantes: documentar o REVOKE de `audit.write`,
registrar que a DDL/seed raiz não muda porque 0020 é migração platform-only
com prova em `test/db/transactional-commands-migration.spec.ts`, omitir o
header de chave vazio nas rejeições, verificar métodos herdados no boot e
completar as duas corridas em que o vencedor conclui dentro do prazo. Fazer
uma tentativa de reparo e novo delivery-review antes da importação.

Disposição DDL/seed: 0020 altera apenas a migração platform de comandos e o
wrapper de auditoria; `database/ddl/02-audit.sql` e as seeds raiz não recebem
essa alteração. `test/db/transactional-commands-migration.spec.ts` é o sensor
da migração aplicada desde banco vazio e dos privilégios de app/owner.

Reparo do ciclo 1: Inspector registrou filtros/ordens, proveniência HTTP com
PostgreSQL e duas corridas em `674c43e3`; Engineer corrigiu precedência,
header vazio, métodos herdados e documentou o REVOKE em `6b536038`;
Architect registrou a disposição DDL/seed em `ffbf3426` e rebindeou trace
em `f9fa42d6`. As provas focais passaram: proveniência 6/6, filtros 5/5,
falhas/corridas 11/11, tenancy unitária 6/6. Após os reparos passaram o
pacote backend completo, `pnpm test:int`, RLS negativo/smoke,
`pnpm lint:migrations`, `pnpm lint:tests`, API baselines 44/44,
`pnpm package-readmes:check`, trace 430/430 e DEVAI forbidden strict desde
`3a69785a` sem achados. Próximo gate: delivery-review Opus ciclo 2 no HEAD
exato após este checkpoint; importar na branch cumulativa só com PASS.
