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
  número, ator auditável distinto do agente de negócio.
- Batch durável por tenant/dispositivo/deviceBatchId, sequência/conjunto
  declarado, lease fenced para lote aberto, recibos por item e lote,
  replay exato de status/body/headers e ponte somente leitura do store
  idempotente legado. Header `Idempotency-Key` 400 ausente; domínio 409/422
  antes de conflito de chave de transporte 422; in-progress 503 fixo.
  Item legado sem chave fica `received` com código neutro e namespace
  sintético reservado, nunca é aplicado implicitamente. Exponha
  `legacyItemIdentityResolver` para identidade host estável entre lotes e
  `legacyIdempotencyStore` para lookup da ponte E6 sem nova reserva.
- Um `Database.txIndependent` por item com
  `{role:'app', isolation:'read committed', strictItemMode:true}`: domínio, consumo, recibo e uma
  operação final da porta OBX na mesma `Transaction`, rollback total por
  item e partial do lote. Rejeite transação envolvente e segunda conexão
  antes de adquirir pool. OFS importa só a interface da porta de eventos,
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
  explicitamente. 0002 é pré-requisito para 1.5.0 em ambos os modos:
  0001 isolado falha no primeiro acesso PostgreSQL com
  `OfflineSyncUpgradeRequiredError`/`OFFLINE_SYNC_UPGRADE_REQUIRED` (503),
  sem SQLSTATE 42703 bruto. Prove E6 no banco 0001→0002, inclusive
  segundo cancel 409. Preserve asserções E6 existentes; setup usa 0002.
  O guard não adiciona `trx.query` separado no caminho E6 unitário, cuja
  sequência publicada é fixa; incorpore a verificação à query existente
  ou mapeie sua falha SQL 0002 para o erro tipado.

Rode sensores focais PostgreSQL/HTTP/RLS, testes existentes afetados, lint
e typecheck offline-sync. Não altere testes para obter verde. Reporte
símbolos reais, migration, riscos e gates; escale incompatibilidade real
ao maestro para triagem Architect/Inspector.
