# CTG9 OFS — delivery-review

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`,
`law/adr/ADR-MOBILE-OFFLINE-0002-sync-parity.md`,
`docs/framework/contracts/offline-sync-api.md`,
`work/rounds/R-0002/ctg9-ofs-contract.md`, a adenda DETRAN C-0002
A1 §8.1 somente leitura, o PASS de prompt
`reviews/ctg9-ofs-engineer-prompt-review-2.json`, os sensores Inspector
em `packages/offline-sync/test/**` (incluindo fixture TTL commit
`4fde00e6`), a migration `packages/offline-sync/migrations/0002_durable_sync.sql`
e a implementação atual não commitada em `packages/offline-sync/src/**`.
Não edite arquivos, não execute Git e não escreva no DETRAN.

Julgue UPS-OFS-01…04, separando código e prova: reserva/cancelamento de
cauda/bloqueio/fechamento/reconciliação/liquidação/consumo, catálogo
tenant/org sem fallback 24 h no modo CTG9; lote durável com sequência,
lease fenced, replay exato e recibos por item, identidade key+hash,
ponte E6; transação independente por item com domínio, consumo, recibo e
uma chamada final de evento na mesma Transaction, rollback parcial,
40P01 real e RLS app; concorrência entre dispositivos, handoff e ações
permitidas/proibidas. Verifique 0001→0002, E6 no 0002 sem regressão,
erro upgrade 503 no 0001 e sem shims; headers/status HTTP e quatro rotas.

O Engineer reporta verdes typecheck/lint, 117 testes unit+wiring e 14
PostgreSQL. Relata como ainda sem prova: corrida simultânea de lote
aberto/lease expirado e mesma chave entre dispositivos em PostgreSQL;
concorrência/handoff/action-port PostgreSQL; cancelamento de cauda
PostgreSQL; replay de headers customizados; caracterização TEAT/BOAT
antes/depois e RLS negativo completo. Determine quais lacunas são
implementação bloqueante e quais exigem sensor Inspector antes da
declaração MUST. Cite arquivo/linha e reparo específico.

PASS libera apenas commit da implementação OFS, não publicação.
Responda JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
