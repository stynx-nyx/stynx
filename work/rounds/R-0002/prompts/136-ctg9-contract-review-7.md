# CTG-0009 — revisão técnica 7 após OD-S15-03

Você é Claude Code Opus 5.5, reviewer independente e somente leitura. Na
worktree entregue à ponte, leia `work/rounds/R-0002/ctg-0009-preflight.md`,
`plan.md` §OD-S15-02 e §Retomada, a adenda A1 §8.1 do DETRAN (somente leitura)
e `reviews/ctg9-conditional-contract-review-6.json`. Confirme os fatos
contra código real de `packages/data`, migrations de audit, `packages/core`,
tenancy, backend SSE, outbox e offline-sync. Não execute Git, não edite
arquivos e não despache workers.

O Owner incluiu SIG/OBX/OFS na STYNX 1.5.0 pela OD-S15-03. Este parecer
avalia se o contrato revisado fecha os bloqueios técnicos do ciclo 6 para
permitir elaborar ADRs superadoras e prompts de Inspector/Engineer. Não
atesta implementação.

Verifique em particular:

1. `audit.fn_row_change`, `audit.write` e `write_command_event` adquirem o
   mesmo advisory antes de selecionar a cabeça; cada evento novo recebe
   `occurred_at` estritamente monotônico sob o lock. `verify_chain` conserva
   hashes legados, detecta bifurcação anterior e suporta a cadeia NULL.
   Prove ordem invertida de BEGIN/lock e três eventos na mesma transação.
2. A API **nova** `Database.txIndependent`/`assertNoHeldConnection` falha
   antes de abrir conexão quando o applier OFS está sob transação ambiente,
   mesmo após wrappers CLS. A marca ALS é holder mutável desligado no
   `finally`; `Database.tx` legado e caminhos CTG5/tenancy/i18n/ratelimit
   continuam válidos. `appendInTransaction` usa a Transaction recebida.
3. `EventStreamSource.now()` trava só a linha do relógio, com deadline curto
   e 503 tipado, sem advisory audit; append conserva ordem advisory→relógio.
   Avalie saturação de pool por reconexões SSE durante transação auditada
   longa e consistência da tupla após append em voo.
4. `audit.write` impede cruzar cadeias por tenant em papel app e restringe
   NULL tenant ao owner de sistema. A contenção da sentinela é declarada e
   terá teste; nenhum novo limite público foi inferido.

Procure qualquer sequência concreta restante de perda de evento, quebra
da cadeia, deadlock não retentável, pool starvation ou regressão dos
contratos CTG5/SSE. Diferencie bloqueio técnico de tarefa ainda pendente de
implementação. Retorne um único JSON válido, sem cerca Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
