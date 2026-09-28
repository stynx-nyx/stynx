# CTG-0009 — quarta revisão técnica condicional

Você é o reviewer independente Claude Code Opus 5.5. Faça revisão somente
leitura do HEAD da worktree STYNX entregue à ponte. Examine
`work/rounds/R-0002/ctg-0009-preflight.md` e o veredito anterior
`reviews/ctg9-conditional-contract-review-3.json`, com o código real SSE,
outbox, offline-sync e data. Não edite arquivos nem execute Git.

Verifique o fechamento dos seis achados do ciclo 3: sentinela `id=''` com
`NULLIF` antes do cast UUID, `now/findById/listSince` no primário, retenção
de IDs/mapeamento de migração, transação independente por item OFS sem lock de
domínio após relógio, sequência `CACHE 1`, upsert/lock no primeiro append
sob READ COMMITTED, e predicado de oldest non-terminal sem `SKIP LOCKED`.
Procure uma sequência reproduzível que ainda perca evento, faça livelock ou
quebre a atomicidade por item. O nível de exigência é uma **prévia suficiente
para preparar contratos e prompts condicionais**, não implementação pronta.

O Owner ainda não decidiu a inclusão CTG9 nem autorizou ADRs superadoras;
nenhum worker pode ser despachado. Não reabra decisões explicitamente listadas
como Owner. Retorne somente um JSON válido:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
