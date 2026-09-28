# CTG9 OBX — delivery-review

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`, `law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md`,
`work/rounds/R-0002/ctg9-obx-contract.md`, DETRAN C-0002 A1 §8.1
somente leitura, o prompt Engineer 152, os sensores Inspector CTG9 em
`packages/data/test/**`, `packages/outbox/test/**`, `packages/backend/test/**`,
`packages/audit/test/**`, e a implementação atual não commitada em
`packages/data/src/**`, `packages/data/migrations/platform/0021_outbox_event_log.sql`
e `packages/outbox/src/**`. Leia o PASS de prompt
`reviews/ctg9-sig-obx-engineer-prompt-review-1.json`. Não edite arquivos,
não execute Git e não escreva no DETRAN.

Julgue UPS-OBX-01…02 e a composição com CTG5/SSE/OFS: append na mesma
Transaction, idempotência por tenant/chave, ordenação advisory→clock,
audit chain, estrita fronteira `txIndependent`, RLS com papéis reais,
ownership marker LEGACY→NEW opt-in, enqueue legado vs cutover sem deadlock,
ledger de cada tentativa, dispatcher com bytes/headers/status e ACK
durável, cursor SSE. Verifique compatibilidade legada e rollback. Há um
risco relatado pelo Engineer: envios legados **anteriores** ao cutover
ganham só resumo `LEGACY_HISTORY_UNAVAILABLE`, não linha por tentativa;
também faltam prova A/B/C e corrida ACK/falha tardia. Determine se o MUST
da adenda e o contrato exigem correção antes do PASS. Diferencie lacuna de
teste de lacuna de implementação; indique reparo executável.

Registre achados concretos com arquivo/linha. PASS libera apenas commit
da implementação OBX, não publicação. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
