# CTG9 OFS — sensor delta review, cycle 4

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review` para o futuro Engineer OFS, somente leitura. Leia os
findings de `reviews/ctg9-ofs-mode-final-review-3.json`, o delta dos
sensores OFS desde `0780e00d`, contrato OFS e prompts 146/153. Consulte
a adenda DETRAN A1 §8.1 somente leitura. Não execute Git nem edite
arquivos.

Confirme os três reparos bloqueantes: teste HTTP 422 usa dois novos lotes
sem sequência e com itens distintos; teste PostgreSQL chama o store real
em CTG9/E6 para provar `identity_mode='ctg9'`, lookup E6 filtrado e
dedup E6; prova PostgreSQL de UPS-OFS-03 executa applier/event port na
mesma transação, rollback total de item com irmão aplicado e 40P01 aberto.
Verifique que não há novo oráculo impossível, setup errado além da ausência
esperada da migration 0002, ou enfraquecimento de asserções E6. Avalie o
prompt Engineer 153 contra os sensores resultantes. PASS libera commit
Inspector OFS e prompt-review Engineer integrado; não atesta código ou
publicação. Retorne exatamente JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
