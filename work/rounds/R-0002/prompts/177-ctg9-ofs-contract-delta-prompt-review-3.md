# CTG9 OFS — prompt-review focal 3, desfecho DETRAN

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`, C-0002 A1 §8.1 no DETRAN
(somente leitura), `work/rounds/R-0002/ctg9-ofs-contract.md`, prompts
Inspector 146 e Engineer 153, e os vereditos focais
`reviews/ctg9-ofs-contract-delta-prompt-review{,-2}.json`. Examine os
sensores atuais em `packages/offline-sync/test/**`. Não edite arquivos,
não execute Git e não escreva no DETRAN.

O segundo parecer foi FAIL porque o contrato classificava
NUMBERING_ALREADY_APPLIED como `conflict`, enquanto o protocolo DETRAN
grava `rejected` e abre conflito de domínio. Verifique que a tabela e os
sensores agora concordam nesse desfecho; NO_COVERAGE e AMBIGUOUS também
abrem evidência de domínio, e EXPIRED mantém `conflict`. A cobertura de
reserva cancelada exclui cauda liberada, sem criar ambiguidade após nova
reserva pelo mesmo dispositivo. Valide a prova in-memory e PostgreSQL
dos códigos/contexto, `reservationId` fora do escopo, projeção
close/settle e sincronização tardia
`createdLocallyAt <= validUntil < now`. Verifique resposta e recibo de
duplicata com queueItemId submetido, além de 400 por chave repetida no
mesmo lote. Preserve E6 sem resolver, RLS e a transação independente
por item. PASS autoriza delivery-review OFS; não declara conformidade,
PR ou publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
