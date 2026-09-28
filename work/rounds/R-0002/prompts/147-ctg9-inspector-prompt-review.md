# CTG9 — prompt-review Inspector SIG, OBX/data e OFS

Você é Claude Code Opus 5.5, reviewer independente em modo prompt-review
e somente leitura. Leia o delivery-review Architect mais recente, os
contratos `ctg9-{sig,obx,ofs}-contract.md`, os prompts 144, 145 e 146,
`INV-OFFLINE-001`, a adenda A1 §8.1 no DETRAN somente leitura e a
configuração real de testes. Não execute Git nem edite arquivos.

Verifique se os sensores red-first cobrem todos os dez MUST com positivos
e negativos, testam comportamento em vez de apenas import ausente, usam
PostgreSQL/RLS real onde há banco, preservam testes existentes, não copiam
DETRAN e respeitam Art. 6: Inspector só escreve testes e fixtures. Os três
write sets devem ser disjuntos; shared trace/baselines/migrações ficam
com maestro/Engineer. A migração legado, os envelopes HTTP e a
composição CTG5 devem ter provas de regressão. Diferencie prova STYNX
executável da paridade final que só o consumidor DETRAN pode afirmar.

PASS libera apenas despacho Inspector. Retorne um único JSON válido sem
Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
