# CTG-0009 — sexta revisão técnica condicional

Você é Claude Code Opus 5.5, reviewer independente e somente leitura.
Na worktree entregue à ponte, leia
`work/rounds/R-0002/ctg-0009-preflight.md`,
`reviews/ctg9-conditional-contract-review-5.json` e o código real de
`packages/data`, `packages/core` (RequestContext), audit, outbox, SSE e
offline-sync. Não execute Git, não edite arquivos nem despache workers.

Verifique se a prévia agora fecha, como contrato **condicional**:

1. `audit.fn_row_change` vigente em 0017 e os dois writers de auditoria
   passam a adquirir a mesma chave advisory antes de travar a cabeça, com
   sentinela para tenant NULL. O relógio não tem trigger de auditoria.
   Comando CTG5, trigger auditado e append seguem cadeia → relógio; dois
   triggers concorrentes não bifurcam a cadeia. Deadlock domínio×audit
   residual vira item retentável, sem efeito aplicado.
2. Uma marca AsyncLocalStorage de conexão detida atravessa os wrappers de
   RequestContext. A API de data falha fechada antes de abrir outra conexão
   quando o CLS perde `TX_CONTEXT_KEY`; o serviço OFS testa antes de qualquer
   escrita, inclusive recibo. Itens são sequenciais, transações top-level
   independentes, e a porta de evento executa append na mesma `Transaction`
   sem `withSystemContext`/`Database.tx` próprios. Endpoint sob o envelope
   CTG5 falha tipado, sem pool starvation ou commit parcial.
3. `TxOptions.isolation` top-level é aplicado antes da primeira query;
   isolamento divergente em nested falha. READ COMMITTED é verificado na
   conexão efetiva. `now()` de tenant sem evento tem INSERT+UPDATE e RLS.

Procure uma sequência concreta restante de perda de evento, cursor
regressivo, deadlock não retentável, esgotamento de pool, quebra da cadeia
de auditoria ou do contrato CTG5/SSE. O nível deste parecer é somente
**prévia suficiente para preparar contratos e prompts condicionais**.
Não é PASS de implementação nem substitui as decisões Owner pendentes sobre
escopo A1 e ADRs normativas. Nenhum worker CTG9 pode ser despachado só com
este parecer.

Retorne um único JSON válido, sem cerca Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
