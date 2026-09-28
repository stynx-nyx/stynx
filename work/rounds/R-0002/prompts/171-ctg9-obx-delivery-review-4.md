# CTG9 OBX — delivery-review ciclo 4, delta final

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, o
`docs/meta/development-contract.md`, o contrato
`work/rounds/R-0002/ctg9-obx-contract.md`, a adenda A1 §8.1 DETRAN
C-0002 (somente leitura), e os vereditos
`reviews/ctg9-obx-delivery-review-{1,2,3}.json`. Examine o delta de
fonte congelado em `packages/outbox/src/**` e os sensores Inspector
atuais em `packages/outbox/test/**`, inclusive PostgreSQL reais; consulte
`packages/data/src/**` e migration 0021 para composição. Não edite,
não execute Git e não escreva no DETRAN.

O ciclo 3 deu PASS limitado ao snapshot anterior. Confirme este delta:
nenhuma mensagem persistida ou retornada revela userinfo, query string,
header secreto ou erro bruto de `fetch`; `appendManyInTransaction` restaura
o `lock_timeout` do chamador mesmo se ele capturar erro JS e continuar a
mesma transação; a corrida de ACK no custom-table dispatch não aborta
as linhas já reclamadas restantes. Reavalie também os novos sensores de
persistência pós-envio, marker UPDATE longo, admissão SSE concorrente e
RLS NULL-tenant, e distinga defeitos de código de prova pendente.
PASS libera apenas o commit da fonte OBX; não declara MUST/publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
