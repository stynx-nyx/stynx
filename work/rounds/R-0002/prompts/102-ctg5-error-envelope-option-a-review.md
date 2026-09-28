# CTG-0005 rejeições HTTP — prompt-review condicional da opção A

Você é Claude Code Opus 5.5, reviewer independente e somente leitura. Leia
as autoridades STYNX na ordem de `AGENTS.md`, especialmente
`law/schemas/error-envelope.schema.json`, `law/invariants/INV-ERROR-001.json`,
`docs/meta/development-contract.md`; leia DETRAN C-0002 §6.2 e §7 somente
para consulta. Compare a fonte real da CTG5 e seus testes com
`work/rounds/R-0002/ctg5-error-envelope-option-a.md`, o finding bloqueante
em `reviews/ctg7-integrated-delivery-review-1.json` e o fallback técnico
`reviews/ctg5-error-envelope-option-a-review-fallback.json`.

Avalie se a proposta ampliada cobre **todas** as rejeições novas geradas pela
CTG5, inclusive 400/403/409/500/503, e pode satisfazer o MUST UPS-TXN-03,
o schema, a política de mudança com aprovação humana, a correlação de
requestId mesmo sem contexto/módulo, a configuração por rota/módulo validada
no bootstrap, a contenção concorrente, o rollback e o replay sem migrar
acidentalmente o filtro global, o 422 legado ou o corpo escolhido pelo
consumidor. Identifique qualquer teste ou documento que a tríade deixou fora,
conflito de locks, mudança de API pública que exigiria rebind, e a evidência mínima para PASS de
entrega. Esta é uma revisão **pré-despacho e condicional**: a aprovação do
Owner ainda não foi registrada; PASS técnico não a substitui. Não edite
arquivos, não execute Git mutável e não publique nada.

Retorne um único objeto JSON válido com `verdict` (`PASS`, `REVIEW`, `FAIL`),
`findings` (severidade, arquivo/linha, reparo concreto) e `summary`. Evite
qualquer texto fora do JSON e escape todas as aspas internas em strings.
