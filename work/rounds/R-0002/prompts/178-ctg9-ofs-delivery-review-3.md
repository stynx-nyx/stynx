# CTG9 OFS — delivery-review ciclo 3

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`, a adenda A1 §8.1 do DETRAN C-0002
(repositório DETRAN somente leitura),
`work/rounds/R-0002/ctg9-ofs-contract.md`,
`reviews/ctg9-ofs-delivery-review-{1,2}.json`, o último veredito focal
`reviews/ctg9-ofs-contract-delta-prompt-review-3.json`, a migration
`packages/offline-sync/migrations/0002_durable_sync.sql`, a implementação
`packages/offline-sync/src/**` e os sensores `packages/offline-sync/test/**`
e `test/db/offline-sync-durable-migration.spec.ts`. Não edite arquivos,
não execute Git, não escreva no DETRAN.

Verifique todos UPS-OFS-01…04 e, em especial, os bloqueios do ciclo 2:
preflight de item de numeração deve produzir recibo terminal por item sem
abortar o lote; os resultados neutros NO_COVERAGE, AMBIGUOUS e
ALREADY_APPLIED devem ser `rejected` com conflito de domínio aberto;
EXPIRED deve ser `conflict` com evidência aberta; validUntil compara com
`createdLocallyAt` comprovado, inclusive sincronização tardia; reserva
cancelada não cobre a cauda liberada; lock SQL e elegibilidade são da
mesma transação independente de item; `consumed` não reaparece como
disponível. Confira o caso `reservationId` fora do escopo, repetição de
chave no mesmo lote, resposta/recibo por queueItemId submetido em
duplicata, e que o E6 legado permanece operante após 0002. Prove
concretamente o que os sensores PostgreSQL e in-memory cobrem e
identifique lacunas remanescentes que impediriam os MUST. Verifique
concorrência, leases/fencing, RLS e transporte HTTP da revisão anterior.

PASS libera apenas o commit da fonte OFS e a integração dos baselines.
Não atesta conformidade final, PR, CI integral ou publicação. Retorne
JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
