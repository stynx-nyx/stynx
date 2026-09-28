# CTG9 OFS — Engineer implementation task

Declare `Engineer` na primeira linha. Trabalhe na worktree cumulativa
indicada pelo maestro. Leia `AGENTS.md` e autoridades,
`ctg9-ofs-contract.md`, ADR-MOBILE-OFFLINE-0002,
`docs/framework/contracts/offline-sync-api.md` e os sensores Inspector
CTG9 commitados. DETRAN A1 §8.1 é somente leitura. Escreva somente
`packages/offline-sync/src/**` e `packages/offline-sync/migrations/0002*`;
o maestro possui Git, DDL/seed compartilhadas, manifests/lockfile,
changesets, baselines, trace, READMEs gerados e RLS negativo em `test/db`.
Não execute Git, commit, push, PR ou escrita no DETRAN. Não altere testes
nem faça shim/cópia DETRAN.

Implemente UPS-OFS-01…04 até os sensores passarem:

- Portas públicas de agente/política/catálogo, applier/evento/concurrency/
  handoff/resolução segundo contrato. Preserve as quatro rotas existentes,
  envelopes/status e serviço legado. A configuração de
  `OfflineSyncPolicyResolver` seleciona o modo CTG9 no bootstrap; sem ela,
  preserve E6 inclusive dedup por hash em chaves diferentes, segundo cancel
  409, TTL e limite publicados. Com resolver, aceite política
  tenant/org/operação, inclusive >100 itens quando permitido; use key+hash
  e repetição terminal idempotente. Bind condicional do controller de lote
  mantém o decorator E6 no modo legado e a precedência nova no CTG9.
  Selecione com `options.policyResolver != null`, preserve os quatro pares
  method/path/permission e `mountControllers:false`, falhe tipadamente para
  portas CTG9 sem resolver ou store não durável com resolver usando
  `OfflineSyncConfigurationError`/`OFFLINE_SYNC_CONFIGURATION_ERROR`.
  Preserve
  `OfflineSyncStore` e tipos E6; use `OfflineSyncDurableStore`/tipos CTG9.
- Numeração: reserva concorrente sem sobreposição, cancelamento só da cauda
  não usada, bloqueio/fechamento/reconciliação/liquidação/consulta de cada
  número, ator auditável distinto do agente de negócio. Registre consumo
  somente quando o número estiver coberto por reserva daquele tenant/device;
  `reservedNumber` sem reserva mantém semântica E6 apenas no modo legado
  sem resolver, sem consumo ou rejeição. No modo CTG9, número declarado
  requer cobertura por reserva elegível do escopo confiável; zero cobertura
  é rejeição por item. Séries diferentes podem sobrepor valores: use
  `reservationId` opcional para desambiguar ou rejeite múltiplas coberturas,
  nunca escolha pela data. Resolva cobertura e trave a reserva dentro da
  transação independente do item; somente `reserved` com `validUntil` não
  anterior a `createdLocallyAt` consome. Use os quatro códigos neutros e os
  estados de recibo da tabela UPS-OFS-01 do contrato, preservando o mapeamento
  TEAT/BOAT no adaptador host. Reserva `consumed` projeta `available` como
  `expired`, preservando `claimed-locally` e `applied`. `ALREADY_APPLIED`
  produz `rejected` com conflito de domínio aberto; NO_COVERAGE e AMBIGUOUS
  também registram evidência de conflito. Uma reserva cancelada não cobre a
  cauda já liberada, permitindo nova reserva dela sem ambiguidade.
- Batch durável por tenant/dispositivo/deviceBatchId, sequência/conjunto
  declarado, lease fenced para lote aberto, recibos por item e lote,
  replay exato de status/body/headers e ponte somente leitura do store
  idempotente legado. Header `Idempotency-Key` 400 ausente; domínio 409/422
  antes de conflito de chave de transporte 422; in-progress 503 fixo.
  A espera por lease aberto é curta e configurável/injetável (padrão
  adequado a retorno bem antes de 10 s nos sensores), com `Retry-After: 1`.
  Item legado sem chave fica `received` com código neutro e namespace
  sintético reservado, nunca é aplicado implicitamente. Exponha
  `legacyItemIdentityResolver` para identidade host estável entre lotes e
  `legacyIdempotencyStore` para lookup da ponte E6 sem nova reserva. Duplicata
  em outro lote preserva o `queueItemId` submetido e registra
  `context.originalQueueItemId`; no modo CTG9, chave declarada ou sintética
  repetida no mesmo lote dá 400 antes da escrita, mantendo E6 como publicado.
- A fronteira por item e o lease pertencem a
  `OfflineSyncDurableStore.submitDurableSyncBatch`, não ao serviço. O
  `PostgresOfflineSyncStore` usa um `Database.txIndependent` por item com
  `{role:'app', isolation:'read committed', strictItemMode:true}`: domínio, consumo, recibo e uma
  operação final da porta OBX na mesma `Transaction`, rollback total por
  item e partial do lote. O store PostgreSQL usa a API real de data,
  `Database.hasHeldConnection()`, e lança o erro tipado
  `IndependentTransactionConnectionError` antes da primeira escrita se
  houver conexão ambiente; `txIndependent` também rejeita segunda conexão
  antes de adquirir pool. Esses símbolos pertencem ao write set paralelo
  data/OBX do outro Engineer; aguarde sua disponibilidade, sem recriá-los
  em offline-sync. O `InMemoryOfflineSyncStore` implementa
  `OfflineSyncDurableStore` com token opaco de transação distinto por item,
  snapshot/rollback por item e lease em memória. O serviço não injeta
  `Database`. OFS importa só a interface da porta de eventos,
  não o pacote outbox. Janela de concorrência e handoff são resolvidos
  pelo host, com suspeita nos dois atos e ações de resolução tipadas.
  O pool de integração usa `stynx_app` real, sem superuser/BYPASSRLS.
  Recibos `received` sobrevivem fora da tx de aplicação; falha interna
  ou da porta de evento reverte efeito/consumo/recibo final/evento daquele
  item e deixa o irmão `applied`. Esgotado 40P01/40001, o item segue
  `received`, o lote `open` com `responseStatus:null`, sem consumo.
- Migration 0002 aditiva/backfill sem perder ID/status/hash, com constraint
  global antiga removida só após índice parcial E6 por hash e nova chave
  CTG9; `identity_mode` é server-owned e o E6 `ON CONFLICT` mira o índice
  parcial; o lookup E6 filtra esse modo e CTG9 escreve seu modo
  explicitamente. Tabelas novas `offline.*` têm chave iniciada por tenant,
  `ENABLE`/`FORCE ROW LEVEL SECURITY`, política por `app.tenant_id` e grants
  explícitos de escrita a `stynx_app` e leitura a `stynx_reader`.
  0002 é pré-requisito para 1.5.0 em ambos os modos:
  0001 isolado falha no primeiro acesso PostgreSQL com
  `OfflineSyncUpgradeRequiredError`/`OFFLINE_SYNC_UPGRADE_REQUIRED` (503),
  sem SQLSTATE 42703 bruto. Prove E6 no banco 0001→0002, inclusive
  segundo cancel 409. Preserve asserções E6 existentes; setup usa 0002.
  O guard não adiciona `trx.query` separado no caminho E6 unitário, cuja
  sequência publicada é fixa; incorpore a verificação à query existente
  por referência a objeto/coluna 0002 de modo que 0001 cause 42703/42P01,
  mapeado ao 503 tipado; não acrescente coluna de resultado que o mock E6
  não fornece. O caminho E6 do store usa
  apenas `database.tx` e as queries já publicadas; `hasHeldConnection` e
  `txIndependent` ficam restritos ao caminho CTG9.

Rode sensores focais PostgreSQL/HTTP/RLS, testes existentes afetados, lint
e typecheck offline-sync. Não altere testes para obter verde. Reporte
símbolos reais, migration, riscos e gates; escale incompatibilidade real
ao maestro para triagem Architect/Inspector.

## Addendum after prompt-review 186 (binding)

In CTG9 mode, batch context includes a stable digest of each item's
`payloadJson`; changed JSON under the same declared `payloadHash` is 409
before any resumed effect. For an existing batch, context/sequence/declared
set divergences return 409 before fingerprint comparison. With matching
context, a bound transport key reused with a changed body fingerprint is 422. A new K2 key may replay or resume the originally declared batch,
but must be durably bound to its batch and fingerprint in a tenant-leading
transport-key ledger with FORCE RLS and app/reader grants; later changed-body
K2 reuse is 422. For a new batch, sequence duplicate/gap checks precede
transport-key reuse checks. `duplicateItems` counts only same-key/same-hash
cross-batch duplicates (including legacy E6 received collisions), excluding
same-batch resume, integrity conflicts and queue ID reuse. CTG9
`itemApplier` without `eventPort` fails in `forRoot` and before any direct
store write. No 503 in-progress response may omit the current trusted
request ID; missing/inactive context fails closed. Preserve E6 mode.
The batch context exhaustively covers org unit, agent, sequence and
each item's queue ID, idempotency key, declared hash, stable JSON digest,
entity type, local entity ID, reserved number, reservation ID and local
creation time. K1 and K2 share one atomic tenant/composite-key unique
ledger; bind each key to its own incoming fingerprint and the same batch.
Binding is at admission after matching context/sequence/declared keys,
before a bounded lease wait, including a contender returned 503. A key
bound to another batch gives 422 for existing or new target batch, with no
replay or new effect. Core's request ID header is fixed `X-Request-Id`.
