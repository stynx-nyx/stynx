# CTG-0009 — terceira revisão técnica condicional do cursor

Você é o reviewer independente Claude Code Opus 5.5. Faça revisão somente
leitura do HEAD da worktree STYNX passada à ponte. Examine
`work/rounds/R-0002/ctg-0009-preflight.md` e os reviews condicionais 1 e 2,
sobretudo `reviews/ctg9-conditional-contract-review-2.json`. Consulte o
código real de `EventStreamSource`/`StynxEventStreamService` e a migration
0018 de outbox. Não edite arquivos nem execute Git.

Confirme se o contrato Architect proposto fecha, sem mudar o cursor público:
precisão `Date` em milissegundos; UUIDv7 com tempo no mesmo milissegundo e
sequência global monotônica nos bits ordenáveis; lock de relógio por tenant
criado com corrida segura, mantido até commit; `now(scope)` sob o mesmo lock,
atualizando o relógio confirmado e retornando seu valor; `listSince`
comparando `(ms,id)` em SQL; mais que `batchSize` eventos no mesmo
milissegundo; append que commita tarde; migração e enqueue legado; ordem de
locks; oldest non-terminal, lease/reclaim, ACK por tentativa, FK de tenant;
adotante offline. A entrega pelo menos uma vez e a possível repetição de
eventos do mesmo milissegundo em conexão sem `Last-Event-ID` estão declaradas.
Procure uma corrida real que ainda pule evento ou crie livelock; se houver,
descreva uma sequência de transações reproduzível.

Esta revisão libera, no máximo, a **preparação** de contratos e prompts
condicionais. O Owner ainda não decidiu incluir CTG9 nem autorizou as quebras
normativas, então nenhum worker pode ser despachado. Não peça implementação
ou testes executados para a prévia. Retorne apenas JSON válido:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
