# CTG9 — Inspector prompt-review focal do ciclo 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura na worktree STYNX. Leia
`reviews/ctg9-inspector-prompt-review-{1,2}.json`, a adenda A1 §8.1
DETRAN somente leitura, o contrato OBX corrigido e prompts Inspector
144–146 no HEAD. Não execute Git nem edite arquivos.

Decida se o único bloqueio do ciclo 2 foi fechado: na fila B segura
marker SHARE, C apenas espera UPDATE e A solicita SHARE, PostgreSQL pode
conceder A sem 55P03; o sensor exige conclusão dentro de deadline,
sem 40P01/duplicata e C depois de A/B, aceitando 55P03 sem obrigá-lo.
Na variante separada em que C **já detém** UPDATE, `FOR SHARE NOWAIT` de A
exige 55P03 tipado, rollback integral e retry com a mesma chave. Confira
que o contrato deixou de afirmar a espera falsa.

Confirme as observações do ciclo 2: OFS-01 cancela só cauda livre e não
reemite aplicado; OFS-02 lê recibos tenant-scoped e não sobrescreve o
original; sensores audit/backend têm diretórios/configs exatos; signature
tem changeset de dependência e `workspace:*` em `c67774f9`. Confirme
write sets Inspector só testes/fixtures, import resolvível e ausência de
oráculo impossível. PASS libera os três Inspectors em paralelo, não
atesta código. Retorne **um JSON puro, sem Markdown**:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
