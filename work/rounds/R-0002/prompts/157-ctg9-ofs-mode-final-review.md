# CTG9 OFS — compatibility review after sensor repair

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia os dois reviews focais anteriores
`reviews/ctg9-ofs-mode-contract-review-1.json` e
`reviews/ctg9-ofs-mode-delta-review-2.json`, o contrato OFS, ADR, docs,
prompts 146/153 e os sensores Inspector OFS na worktree congelada. Leia a
adenda DETRAN A1 §8.1 somente leitura. Não execute Git nem edite arquivos.

Verifique os bloqueios restantes do ciclo 2: a suíte upgrade aplica 0002
depois de semear 0001 e antes de qualquer chamada de store 1.5.0, sem
depender da ordem dos testes; CTG9 insere `identity_mode='ctg9'`
explicitamente e os negativos/indexes cobrem ambos os modos. Confira
bootstrap sem resolver com portas CTG9, custom store não durável com
resolver, `policyResolver:undefined`, body `batchSequence` no E6 e
`clearReservation` nunca chamado. O contrato exige 0002 em ambos os modos,
erro de upgrade tipado em 0001, E6 hash filtrado por modo, tipos E6
assignable e ausência de aplicação para item legado sem chave. Considere
qualquer novo bloqueio concreto de prova ou implementação.

Os sensores devem estar vermelhos por produção ausente, sem erro de setup
ou oráculo impossível. PASS libera o commit Inspector e o prompt-review
Engineer; não declara CTG9 implementada. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
