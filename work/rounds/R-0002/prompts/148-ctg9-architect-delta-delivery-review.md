# CTG9 — Architect delta delivery-review after REVIEW 1

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Trabalhe na worktree STYNX recebida.
Leia `reviews/ctg9-architect-delivery-review-1.json`, a adenda A1 §8.1
do DETRAN em modo somente leitura, o código atual afetado e o delta
Architect desde `065b2dd1`. Não execute Git nem edite arquivos.

Verifique se os três bloqueios do ciclo 1 foram fechados com mecanismo
implementável e sem regressão: (1) OBX DDL sem corte automático, cutover
opt-in idempotente com autoridade única entre `dispatchDue` legado e novo,
ACK de SENT em voo sincronizado, custom tables e enqueue pós-corte;
(2) SIG inclui verificador criptográfico concreto no STYNX para
CMS/PAdES ByteRange, X.509, política, TSA RFC 3161 e OCSP/CRL assinados,
com manifesto vinculado e readiness real; (3) OFS fixa ordem determinística
de domínio/recibo e `Idempotency-Key`, preservando 400/422 HTTP e replay
dos bytes originais. Verifique também os reparos não bloqueantes do ciclo 1:
ACK sem evento em quarentena owner-only, constraint legada preservada,
código STYNX neutro e chave sintética sem colisão, concorrência do mesmo
lote, defaults sem resolver, SIG ADR accepted/índice, partição auditada no
timestamp escolhido e nota de isolamento no guia/changeset.

Avalie coerência dos contratos `ctg9-{sig,obx,ofs}-contract.md`, ADRs,
`ctg-0009-preflight.md` e docs públicas. O contrato deve estar pronto
para sensores Inspector, não afirmar implementação ou publicação. Um
contraexemplo de perda/duplicação, falsa assinatura, regressão de API,
deadlock ou RLS pede REVIEW com reparo mínimo. PASS libera apenas o
prompt-review dos Inspectors. Retorne **um JSON puro, sem cercas Markdown**:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
