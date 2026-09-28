# CTG-0005 envelope — Inspector

Declare **Inspector** (Constitution Art. 6). **Primeiro, verifique** a
classificação Architect em
`work/rounds/R-0002/ctg5-error-authority-classification.md`, o commit
Architect que emenda o contrato/catálogo/nota de migração e um
prompt-review PASS deste prompt. A opção A corrige código ainda não
publicado para o schema existente, sem alterar `law/` ou os corpos legados;
por essa classificação, **não** há recibo Owner de escolha da opção A. Se
qualquer evidência faltar, pare sem editar e reporte bloqueio.
O maestro registra os SHAs exatos em `work/rounds/R-0002/record.md` antes
do despacho; leia esse registro e o PASS
`work/rounds/R-0002/reviews/ctg5-envelope-worker-prompt-review-2.json`.
Você não executa Git, inclusive leitura de log/show; o maestro fornece a
worktree no SHA registrado. Se o registro e os arquivos não concordarem,
pare e reporte `reference-gap`.
Leia `ctg5-error-envelope-option-a.md`, o PASS técnico review-4, o PASS de
classificação `reviews/ctg5-error-authority-classification-review-1.json`,
o contrato Architect emendado e `docs/framework/contracts/errors.json` no commit
registrado, além da fonte/testes CTG5. Para cada código, `runtimeBody` do
catálogo e o contrato fixam mensagem, `retryable` e `details`; se faltar
valor fixo, devolva `reference-gap`, sem inventá-lo. Do not execute Git, edit source,
`law/`, manifests, workflows or DETRAN. Do not weaken or delete tests.

Own only backend tests under `packages/backend/test/**`. Include the existing
HTTP, advanced, faults, provenance, filters, no-module, Angular interop and
if-match HTTP specs, the unit contract spec, and a new
`transactional-command-errors.integration.spec.ts`. The Angular interop spec
borrows a CTG7 test lock; the If-Match spec borrows a CTG6 test lock. Add
assertions only, preserving every existing 412/428, 422, 502 and RLS proof.
Move the invalid `mismatchCode:''` provenance fixture to a separate
`app.init()` refusal fixture; change the valid custom code fixture to
`SCOPED:CONFLICT:command-mismatch` while keeping its configuration proof.

For each reachable CTG5-owned 400/403/409/500/503 in **both** plan tables,
assert exact status and `toEqual` of the complete canonical body, no
`code`/`context`, body.requestId equal to `X-Request-Id`, and no domain,
audit or key effect. Assert `retryable:true` only on in-progress 409;
generic transaction 503 uses false. Cover two concurrent 409 losers with
different IDs and eventual replay. Build the no-module fixture both with
core and without core; the latter has no guard, no StynxAuthModule and no
command module. An invalid inbound request ID must become a generated UUIDv7.
With core, body.requestId must equal the ID the core middleware placed in
X-Request-Id, even when RequestContext is not injectable in the controller
module.
Combined If-Match routes retain 412/428 and get 409 in both decorator orders.
Read the pattern from `law/schemas/error-envelope.schema.json` and compare
the **behaviour** of `forRoot`/`app.init()` on the same accepted/rejected
corpus; do not import or require a new public regex export.

No novo spec de erros, cobrir explicitamente: scope callback 500
`COMMAND:CONFIGURATION:scope-callback-failed`; tenancy port 500
`COMMAND:CONFIGURATION:tenancy-port-failed`; status inválido 500
`COMMAND:CONFIGURATION:status-invalid`; persistStatus inválido/lançando 500
`COMMAND:CONFIGURATION:status-policy-invalid`; corpo de resposta não JSON
500 `COMMAND:CONFIGURATION:response-not-json`; metadataSelector,
entityIdSelector e redaction lançando 500
`COMMAND:CONFIGURATION:audit-metadata-failed`. Todos sem efeito durável.
Inclua `persistStatus` lançando um `HttpException` próprio: ele continua
erro do callback CTG5 e deve virar 500 `status-policy-invalid`, enquanto o
`HttpException` criado explicitamente pela fronteira para um
`CommittedCommandError` não selecionado conserva o corpo do consumidor.
Falhas de setup (pool.connect/BEGIN/sessão), store lookup/reserve, audit sink,
store complete/clear e COMMIT que não são `StynxDataError` recebem 503
`COMMAND:DEPENDENCY:transaction-failed`, `retryable:false`, sem domínio,
auditoria ou chave. No unitário, cobrir execução fora de HTTP e os checks
defensivos runtime de marcação, lockTimeoutMs e ttlMs; mismatchCode inválido
é somente recusa de bootstrap, sem 500 runtime.

Test `forRoot` invalid mismatchCode/lockTimeoutMs as synchronous throws;
test route mismatchCode/lockTimeoutMs and `@Idempotent` ttlMs as `app.init()`
refusals. Preserve and strengthen **legacy** data-error assertions to their
exact existing shape/status: 504 `STATEMENT_TIMEOUT` from raw 57014, 503
`SERIALIZATION_FAILURE` from 40001, and wrong-role 500
`TRANSACTION_IDENTITY_MISMATCH`. Keep their durable-state controls. The
actorless `Database.tx` branch is unreachable from a valid CTG5 HTTP route;
cite its existing data unit test or report that gap to the Architect for a
separate data-test lock.
The handler-fault case stays status 502 and body `{code:'HANDLER_FAILED'}`;
the unselected CTG5 422, legacy idempotency 422, persisted 502 and replay
keep their bytes and headers. For audit/completion/COMMIT failures assert the
new exact 503 envelope, both attempts, and `assertNoDurableEffect`.

Run the focused backend `test` task against real PostgreSQL as `stynx_app`
with two tenants. Record the **expected red** failures in new/strengthened
sensors, exact command, output and counts. `pnpm test:int` alone is not
sufficient: backend integration specs run under its `test` script. Hand the
test paths to the Architect for `law/trace.json` rebind. No source edits.
O resultado segue para delivery-review independente Opus PASS antes de
qualquer importação cumulativa; CI completo, PR e publicação ficam no gate
final da OD-S15-02.
