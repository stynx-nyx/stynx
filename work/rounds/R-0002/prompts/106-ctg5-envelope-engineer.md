# CTG-0005 envelope — Engineer

Declare **Engineer** (Constitution Art. 6). **Primeiro, verifique**
`work/rounds/R-0002/authorization-ctg5-error-envelope.md`: deve registrar
`authorized_by_role: Owner`, opção A e `INV-ERROR-001`. Verifique o SHA do
commit Architect do contrato/catálogo, o SHA do commit Inspector de testes
vermelhos, o SHA do rebind Architect de `law/trace.json` e um prompt-review
PASS deste prompt; se faltar qualquer um, pare sem editar e reporte bloqueio.
Leia `ctg5-error-envelope-option-a.md`,
`docs/framework/contracts/errors.json` e o contrato CTG5 no commit Architect:
`runtimeBody` fixa mensagem, retryable e details; não invente variantes.
Leia todos os sensores vermelhos. Implement only `packages/backend/src/transactional-command/**`, the
manual prose of `packages/backend/README.md`, and the fixed-group
`.changeset/transactional-command-15.md`. Do not edit tests, `law/`, API
baselines, manifests, lockfile, workflows or DETRAN; do not execute Git.

Make CTG5-owned rejections use the law envelope and fixed public messages.
Use the IFM requestId order: active core context, normalized response
header, normalized request header, generated UUIDv7; set X-Request-Id equal
to body.requestId. Do not cache it in the singleton filter. Make
`CommandModuleRequiredInterceptor` emit the same canonical 503 with or
without core. Se a fixture Nest sem módulo não alcançar o filtro da rota,
devolva `reference-gap` ao Architect em vez de emitir resposta crua. Resolva
requestId somente para `CommandRejectionResponse`: nunca ecoe header bruto
nem ID de transação anterior; não altere headers/bytes de
`CommittedCommandResponse`. Preserve os checks defensivos runtime de
marcação, lockTimeoutMs e ttlMs como envelopes canônicos; remova apenas o
ramo runtime `COMMAND_MISMATCH_CODE_INVALID`. Validate module mismatchCode/lockTimeoutMs synchronously in
`forRoot`, and route mismatchCode/lockTimeoutMs plus marked route ttlMs in
`onApplicationBootstrap`; remove the runtime mismatch-code 500. Keep
`mismatchCode` configurable under the schema regex. Do not change global
StynxErrorFilter, legacy idempotency 422 or selected consumer response bytes.

Track the CTG5 origin phase in a closure without wrapping the error or
erasing its `.code`. Initialize `phase='setup'` immediately before
`this.database.tx`; setup runs inside Database.tx. Set `store` as the first
callback statement, `commit` as the last before return, and distinguish
`audit`, `ctg5-callback` and `handler`. Classify only after Database.tx has
mapped raw 57014/40001. Precedence: (1) `CommandRejectionResponse`,
`CommittedCommandResponse`, and the `HttpException` of
`persistStatus=false` pass through untouched; (2)
`TransactionalReservationTimeoutError` becomes retryable 409 in-progress;
(3) every `StynxDataError` stays on the legacy filter, including 504
STATEMENT_TIMEOUT, 503 SERIALIZATION_FAILURE and wrong-role 500; (4) own
setup/store/audit/commit failures become nonretryable canonical 503,
`ctg5-callback` becomes its specified canonical 500; (5) handler exceptions
retain the consumer contract. Convert own errors only after rollback. The
unselected 422 and persisted/replayed 502 remain byte-identical.

Converta `scope()` e `tenancyPort.get()` que lançam em seus 500 canônicos
**antes** da transação e de qualquer SQL, fora do classificador de fase.
Dentro de `writeAudit`, metadataSelector, entityIdSelector e redaction são
fase `ctg5-callback` e viram 500 `audit-metadata-failed`; só
`auditSink.writeInTransaction` é fase `audit`. Marque `ctg5-callback` em
status, persistStatus e encodeBody; restaure `store` antes de complete/clear.

Run the focused backend suite with PostgreSQL/RLS as `stynx_app` and two
tenants; o log do task `@stynx-nyx/backend#test` no mesmo HEAD deve nomear
`transactional-command-errors`, `no-module`, `if-match-http`, `http`,
`advanced`, `faults`, `provenance`, `filters` e
`angular-transactional-command-http`. Execute backend lint/typecheck,
`pnpm check:rls-negative`, `pnpm check:rls-smoke`,
`pnpm check:trace --print`, `pnpm package-readmes:check` e DEVAI strict.
Report exact green counts and the remaining
API declaration diff to the Architect for a separate baseline rebind. Do not
run the final full CI, open a CTG-specific PR, or publish an RC. A entrega
segue para delivery-review independente Opus e só pode ser importada na
branch cumulativa após PASS.
