# CTG9 OFS — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e autoridades na ordem exigida, o contrato
`ctg9-ofs-contract.md`, `docs/framework/contracts/offline-sync-api.md`,
`INV-OFFLINE-001` e A1 §8.1/compatibilidade do DETRAN somente leitura.
Escreva **somente testes e fixtures** sob `packages/offline-sync/test/**`.
Não altere `src`, migrations, docs, law, generated, baselines ou outros
pacotes. Não execute Git, commit, push nem PR.
Os aliases de `auth`, `backend`, `contracts`, `idempotency`, `ratelimit` e
`sessions` para fontes atuais do teste PostgreSQL foram provisionados em
`c21ba672`. Nomeie sensores PostgreSQL `*.integration.spec.ts` para o
Vitest int coletá-los. Não edite o helper compartilhado
`packages/data/test/support/postgres.ts`.
Configure a deterministic `OfflineSyncPolicyResolver` for every CTG9
durable parity sensor. Without it, E6 behavior remains: hash dedup across
different keys, second cancel 409, default TTL and 100-item maximum.
Keep all existing E6 assertions intact; update only the PostgreSQL test
harness setup to apply 0001→0002 before running 1.5.0 E6 code. Add a
0001-only negative asserting typed `OFFLINE_SYNC_UPGRADE_REQUIRED` (HTTP 503) before queue DML and no raw 42703. Add a no-resolver compatibility
sensor. Never use body input to select a mode.
Prove both `forRoot` bootstraps, including E6 controller metadata and
`@Idempotent`, CTG9 controller metadata, the four route method/path/
permission pairs, and CTG9 service mode with `mountControllers:false`.
`policyResolver: undefined` remains E6. Run the E6 store and service on an
actual 0001→0002 PostgreSQL schema: cross-key hash dedup, queue-ID reuse
409 and repeated cancel 409 must survive. Check CTG9-only ports without a
resolver and a resolver with an E6-only custom store fail at bootstrap with
`OfflineSyncConfigurationError`/`OFFLINE_SYNC_CONFIGURATION_ERROR` and the
invalid option name.
Check a body with `batchSequence` leaves E6 active and transport-key reuse
with a changed body still yields the published 422. Assert that the
legacy store bridge never calls `clearReservation`.
Exercise `legacyItemIdentityResolver` across batches, and the read-only
`legacyIdempotencyStore` bridge with an unexpired completed entry plus
pending/expired/mismatched negatives. No unkeyed item applies a domain effect.

UPS-OFS-01: PostgreSQL/RLS real com dois tenants; reserva concorrente sem
sobreposição, TTL do catálogo por tenant/órgão/operação e expiração,
agente de negócio separado do ator, bloqueio/fechamento/reconciliação/
liquidação/consulta de cada número, transições válidas/negativas e
repetições idempotentes sem reemitir número aplicado. Cancele uma reserva
com parte já aplicada: só a cauda não usada volta a ficar disponível;
números aplicados nunca são reemitidos e cancelar de novo é idempotente.
Adenda após prompt-review focal: CTG9 `reservedNumber` exige uma reserva
`reserved` do tenant/device/org/entity que cubra o número, com
`reservationId` opcional para séries sobrepostas. Preserve E6 sem essa
exigência. Prove em ambos os stores os quatro códigos/contextos da tabela
UPS-OFS-01, inclusive `ALREADY_APPLIED` como `rejected` com conflito de
domínio aberto e `NO_COVERAGE`/`AMBIGUOUS` também com evidência aberta.
Prove `createdLocallyAt <= validUntil < now` aplicado e
`createdLocallyAt > validUntil` recusado, seleção dentro da transação
do item com lock contra close, e nova reserva da cauda liberada após
cancel sem ambiguidade. Em PostgreSQL, cubra também `reservationId`
fora do escopo/intervalo e close/settle que transforma `available` em
`expired` sem alterar `claimed-locally`/`applied`.

UPS-OFS-02: lotes >100, legado sem sequência e item sem chave apenas
`received`/código STYNX neutro mapeável pelo consumidor, identidade durável do
lote, conjunto declarado, sequência repetida 409/lacuna 422, replay de
ACK perdido, contexto divergente 409, hash igual/chave diferente e chave
igual/hash divergente com recibo rejeitado, crash e retomada sem efeito
duplicado. `getSyncBatchReceipt` e `getSyncItemReceipt` retornam o recibo
original no próprio tenant; tentativa rejeitada não o substitui e leitura
cruzada de tenant falha. Prove namespace de chave sintética sem colisão com chave do
cliente e rejeição de chave cliente com prefixo `stynx:legacy:`;
duplicata de outro lote mantém o `queueItemId` submetido na resposta e
no recibo e registra `context.originalQueueItemId`; chave declarada ou
sintética repetida dentro do mesmo lote CTG9 recebe 400 antes da escrita.
duas submissões concorrentes do mesmo lote aberto, ausência do
resolver mantendo TTL publicado de 24h, e lote legado migrado fechado.
Teste service e HTTP Nest com envelopes/status existentes: falta de
`Idempotency-Key` continua 400, chave reaproveitada com corpo distinto
continua 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`, validação do domínio
tem precedência definida, e retry idêntico devolve status, bytes e headers
de replay configurados originais. Lote aberto ocupado responde 503
`OFFLINE_SYNC:BATCH:in-progress` com `Retry-After: 1` sem efeito novo;
recibo legado fechado reproduz entrada idempotente ainda válida do store
legado antes de conflito, com tenant/usuário/rota/chave/fingerprint iguais.
Prove negativos expired, fingerprint divergente, pending, ausente e corpo
sem representação byte-equivalente: falham fechados sem novo efeito;
spy confirma nenhum `reserve`/`persistResponse` no store legado. Compare
bytes/headers ao `IdempotencyInterceptor` publicado e negue replay
fabricado para `legacy_closed_unverified`.

UPS-OFS-03: applier de domínio e porta de evento recebem exatamente a
mesma `Transaction`, com efeito, consumo, recibo e evento em um commit;
falha interna reverte os quatro, resultado parcial persiste outros itens.
`@TransactionalCommand` indevido rejeita antes do primeiro write; efeito
que tenta `AuditSqlSink`/`withRequestContext`/`withSystemContext` e segunda
conexão falha tipado sem hang ou pool starvation. Itens sequenciais;
continuation pós-commit é permitida. Teste RLS negativo cross-tenant.
Após retry externo exaurido de 40P01/40001, item permanece aberto, sem
ACK concluído nem consumo. Prove isolamento cross-tenant também na
suspeita, conflito e resolução de UPS-OFS-04.

UPS-OFS-04: janela por agente/dispositivo, suspeita nos dois atos,
handoff autorizado, janela ausente/desligada, ações de resolução
permitidas/proibidas e legados não equiparados mecanicamente.

Inclua prova de upgrade 0001→0002 com fila/IDs, status e hashes preservados,
sem afirmar efeito já aplicado. A constraint antiga `(tenant_id,payload_hash)`
só cai depois da nova chave existir. Registre a matriz de paridade para o
consumidor em `packages/offline-sync/test/fixtures/consumer-parity-matrix.json`
ou no relatório final Inspector. STYNX prova envelopes/status neutros; HTTP
TEAT/BOAT e a paridade final pertencem ao DETRAN em R-0022/R-0024.
Os sensores exercitam serviço, HTTP e SQL; falha de
import ou migration ausente não substitui o vermelho por critério. Rode
sensores focais e registre vermelho esperado; não
enfraqueça testes. O maestro faz rebind de trace e commit Inspector.
Não importe nem copie código DETRAN. O Engineer/maestro mantém provas
`test/db/runtime` e `tenant-isolation-coverage.json` das novas tabelas.

## Addendum after prompt-review 186 (binding)

For an existing CTG9 batch, context/sequence/declared-set divergence,
including changed `payloadJson` digest, precedes transport comparison and
returns 409. With matching context, a previously bound transport key and
changed body fingerprint returns 422. A new key binds to that batch in a
tenant-scoped ledger and may replay or resume the originally declared items;
its later changed-body reuse returns 422. For a new batch, duplicate sequence
is 409, gap is 422, and only then reuse of a transport key with a changed
fingerprint is 422. Cover PostgreSQL and memory parity. `duplicateItems`
counts same-key/same-hash cross-batch duplicates, including E6 received
collisions, and excludes same-batch resume, integrity conflict and reused
queue ID. Prove resume invariance. CTG9 itemApplier without eventPort fails
at bootstrap and before direct-store batch writes, with no rows. A lease-held
503 carries the contender's current trusted request ID; replay does not
capture or propagate an earlier request ID. These rules supersede any
unqualified earlier sentence about changed-body transport-key reuse.
The Engineer's transport-key ledger adds a sixth CTG9 relation. For this
addendum only, the Inspector may also edit
`test/db/offline-sync-durable-migration.spec.ts` to prove its tenant-leading
key, FORCE RLS, grants and cross-tenant negatives; no other `test/db` file.
The context sensor must vary each pending item's `reservedNumber`,
`reservationId`, and `createdLocallyAt` in an open-batch K2 retry,
keeping other fields fixed; each mutation is 409 before consumption,
receipt or event. The context also includes `queueItemId`,
`idempotencyKey`, `payloadHash`, stable `payloadJson` digest,
`entityType`, `localEntityId`, org unit, agent and batch sequence.
Prove K1 and K2 share one unique tenant/composite-key namespace and
that K2 is bound to its own incoming transport fingerprint, so
identical K2 replays and changed-body K2 returns 422.
Binding occurs at batch admission before the lease wait, including a K2
contender that receives 503. K1 from batch A offered against either an
existing or new batch B returns 422, no replay headers, no new ledger
binding or effect. With a held lease but no active trusted RequestContext,
the controller fails closed with a configuration error (HTTP 500), never
503 without requestId; verify no new receipt, consumption or event. Core
uses a fixed `X-Request-Id` header.
