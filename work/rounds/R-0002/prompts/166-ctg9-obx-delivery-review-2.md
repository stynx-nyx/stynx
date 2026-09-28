# CTG9 OBX — delivery-review ciclo 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, o development-contract,
`law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md`,
`work/rounds/R-0002/ctg9-obx-contract.md`, DETRAN C-0002 A1 §8.1
somente leitura, o REVIEW estruturado
`reviews/ctg9-obx-delivery-review-1.json`, a implementation atual não
commitada em `packages/data/src/**`, migration platform 0021 e
`packages/outbox/src/**`, e os sensores Inspector OBX/data/backend/audit,
inclusive commit `e714fba4`. Não edite arquivos, não execute Git e não
escreva no DETRAN.

Reavalie os quatro bloqueios: cerca de ordinal/lease contra falha tardia,
status/headers/bytes/hashes/evidence-state no ledger, ACK/retry 55P03
tipado, preservação da RLS NULL-tenant publicada de audit. Verifique
também isolamento de falha de persistência após envio, limite de waits
marker/cutover, ordem de locks, histórico legado sem fabricar tempo de
ACK, canonicalização do tenant, collision/dedup, SSE e composição CTG5.
Leia os novos sensores PostgreSQL de lease reclaim, schedulers,
ACK/cutover, A/B/C e falha tardia. Classifique lacunas remanescentes
da matriz como código bloqueante ou sensor necessário antes de
conformidade/publicação. PASS libera somente commit da fonte OBX, não
declaração MUST nem publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
