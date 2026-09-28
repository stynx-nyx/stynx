# CTG9 — prompt-review dos Architects SIG, OBX e OFS

Você é Claude Code Opus 5.5, reviewer independente em modo prompt-review,
somente leitura. Na worktree, leia `work/rounds/R-0002/plan.md`,
`ctg-0009-preflight.md`, `prompts/137-ctg9-sig-architect.md`,
`prompts/138-ctg9-obx-architect.md`,
`prompts/139-ctg9-ofs-architect.md` e o parecer técnico
`reviews/ctg9-contract-review-7.json`. Confronte com a adenda A1 §8.1
da especificação C-0002 no DETRAN (somente leitura), os ADRs atuais,
`INV-OFFLINE-001` e as APIs reais dos pacotes. Não execute Git nem edite.

OD-S15-03 incluiu CTG9 e os dez MUST na 1.5.0; OD-S15-02 exige um único
gate CI/PR/publicação após CTG9. Julgue se os três prompts permitem
Architects paralelos sem lock comum, sem copiar DETRAN, preservando legados
e sem antecipar implementação/Inspector. Aponte qualquer contrato ausente
ou autoridade indevidamente atribuída, especialmente auditoria/clock,
fronteira transacional, recibos/ACK, prova de assinatura, saúde e
compatibilidade offline. Critério de PASS: os prompts são despacháveis
como trabalho Architect; não é PASS do produto.

Retorne um único JSON válido, sem cerca Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
