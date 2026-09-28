# CTG-0009 — quinta revisão técnica condicional

Você é o reviewer independente Claude Code Opus 5.5. Faça somente leitura
do HEAD da worktree STYNX entregue à ponte. Leia
`work/rounds/R-0002/ctg-0009-preflight.md`, o veredito anterior
`reviews/ctg9-conditional-contract-review-4.json`, e o código real de
`Database.tx`, audit hash chain, transactional command, outbox, SSE e
offline-sync. Não execute Git, não edite arquivos nem despache workers.

Verifique se a prévia atual fecha os dois bloqueios do ciclo 4: (1) cada
item OFS em transação top-level independente, com rejeição tipada antes de
qualquer escrita quando há transação ambiente, inclusive se o endpoint for
montado sob `@TransactionalCommand`; (2) ordem total do lock da cadeia de
auditoria antes do relógio outbox, incluindo triggers e auditoria posterior
do envelope. Reavalie também os quatro achados não bloqueantes: migração
de UUIDv4/precisão µs para UUIDv7/ms com mapa, codificação sem módulo do
bigint global de 63 bits nos 74 bits ordenáveis do UUIDv7, e checks SQL na
conexão efetiva para READ COMMITTED, leitura primária e read-write.

Procure uma sequência concreta que ainda cause perda de evento, cursor
regressivo, deadlock, livelock, commit parcial indevido, consumo indevido
de pool ou quebra de compatibilidade com o SSE/CTG5 já implementados.
O nível é apenas **prévia suficiente para preparar contratos e prompts
condicionais**, não implementação ou autorização final. A decisão Owner
de incluir SIG/OBX/OFS na 1.5.0 e eventuais ADRs superadoras ainda está
pendente; não a presuma nem a reabra. Nenhum worker CTG9 pode ser despachado
com base só neste review.

Retorne um único JSON válido, sem cerca Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
