# CTG9 OBX — delivery-review ciclo 3

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, o
`docs/meta/development-contract.md`,
`law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md`,
`work/rounds/R-0002/ctg9-obx-contract.md`, a adenda A1 §8.1 DETRAN
C-0002 (somente leitura), e os vereditos
`reviews/ctg9-obx-delivery-review-{1,2}.json`. Examine os bytes atuais
de `packages/data/src/**`, migration platform 0021,
`packages/outbox/src/**`, e sensores Inspector OBX/data/backend/audit,
inclusive os sensores novos posteriores ao review 2. Não edite arquivos,
não execute Git e não escreva no DETRAN.

O review 2 deu PASS apenas ao snapshot móvel e exigiu congelamento.
Reavalie a fonte final e os ramos novos: 40P01/55P03 embrulhado e
esgotamento tipado; falha de persistência depois do envio isolada por
linha, `reconciliationRequired` sem reenvio e continuação do lote;
`lock_timeout` separado do deadline; ACK negativo com backoff; restauração
do timeout da transação app que continua a CTG5/audit/idempotência;
owner waits limitados; SSE admite um preflight real por tenant e erro
tipado em timeout; ACK legado sem alegar HMAC não demonstrado;
quarentena quando há conexão ambiente; redaction do provider/headers;
RLS audit NULL-tenant preservada. Confirme sensores PostgreSQL reais,
sem confundir uma fila global já ocupada por testes paralelos com defeito
de produção. Classifique lacunas da matriz antes da conformidade.
PASS libera apenas commit da fonte OBX, não declaração MUST/publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
