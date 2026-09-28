# CTG9 — prompt-review focal do delta Architect

Você é Claude Code Opus 5.5, reviewer independente e somente leitura.
Leia `reviews/ctg9-prompt-review-closure-1.json` e somente os deltas
relevantes em `prompts/137-ctg9-sig-architect.md`,
`prompts/138-ctg9-obx-architect.md`,
`prompts/139-ctg9-ofs-architect.md`, `ctg-0009-preflight.md` e
`plan.md` §Retomada. Confirme caminhos e autoridade no Art. 6 das
constituições, sem executar Git ou editar arquivos.

Julgue se o bloqueio SIG foi reparado: Architect escreve apenas no contrato
existente `signature.md`, documento de rodada e eventual ADR, nunca em
`packages/`; negativos dos adapters clínicos/juntas e resultados de
`verifyWithdrawalEvidence` estão no prompt. Confirme que OBX possui os
docs data/audit no write set, que OFS só cita as portas, e que só o maestro
atualiza índices ADR/contratos. Verifique os reparos não bloqueantes do
parecer anterior: nomes `appendInTransaction`/`appendManyInTransaction`,
SENT/ACK sem reenvio na migração, epoch-aware verify com função da época
corrente, RR não retentável, selo por `SET LOCAL transaction_read_only`,
GUC `STY41` antes de advisory. Confirme que os três prompts Architect
são despacháveis em paralelo sem lock comum. Não avalie implementação.

Retorne um único JSON válido sem Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
