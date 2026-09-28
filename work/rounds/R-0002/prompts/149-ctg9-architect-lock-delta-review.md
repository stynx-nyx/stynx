# CTG9 — Architect delivery-review focal do ciclo 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review` e somente leitura. Leia os vereditos
`reviews/ctg9-architect-delivery-review-1.json` e
`reviews/ctg9-architect-delta-delivery-review-2.json`, a adenda DETRAN A1
§8.1 somente leitura, os contratos/ADRs CTG9 e o delta desde `d3347c43`.
Confronte o mecanismo com o código legado onde necessário. Não execute Git
nem edite arquivos.

O ciclo 2 deixou um bloqueio: cutover OBX marker UPDATE → clock podia
encontrar app append clock → enqueue marker SHARE. Verifique que todo append
novo agora toma marker SHARE antes de advisory/clock; cutover toma marker
UPDATE → linhas legadas → clock e nunca audit writer/advisory na mesma
transação; audit de domínio legado → enqueue não cria ciclo porque cutover
não pede advisory. Teste mentalmente ordens de BEGIN e COMMIT invertidas,
falha de envio pós-corte e eventos nativos sem cutover. Verifique rollback
integral/timeout/retry idempotente e ausência de perda ou claim duplo.

Confira as observações do ciclo 2: `recordDispatchFailure` espelha ERROR,
evento nativo despacha em LEGACY, OFS preserva headers de replay e 503
in-progress, recibo legado idempotente ainda válido é reproduzido,
produção SIG exige verificador marcado ou reconhecimento consumer-owned,
e preflight usa código neutro/chave sintética. Confirme Art. 6,
compatibilidade pública e que os contratos estão prontos para prompt-review
Inspector, sem afirmar implementação. Dê contraexemplo concreto e reparo
mínimo para qualquer achado. Retorne **um JSON puro, sem Markdown**:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
