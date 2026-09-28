# CTG-0005 envelope — revisão técnica condicional após reparos de data

Você é Claude Code Opus 5.5, reviewer independente e somente leitura. Leia
`AGENTS.md` e as autoridades nele indicadas em ordem, DETRAN C-0002 §6.2 e
§7 somente para consulta, a fonte e os testes CTG5 reais, o plano
`work/rounds/R-0002/ctg5-error-envelope-option-a.md`, o prompt 103 e
`reviews/ctg5-error-envelope-option-a-review-3.json`. Avalie exatamente se
os quatro reparos exigidos pelo REVIEW anterior foram fechados sem ampliar
indevidamente o escopo nem enfraquecer sensores: manter 57014/40001 visíveis
para `Database.tx` via variável de fase e classificar só após o mapeamento;
preservar `StynxDataError` e o wrong-role 500 como legados; priorizar o
timeout de reserva 409 sobre a categoria genérica 503; separar asserções
canônicas CTG5 das asserções legadas e manter seus controles duráveis.

A decisão do Owner entre esta opção A e uma exceção ADR ainda não foi
registrada; esta é revisão técnica pré-despacho, não autorização da mudança.
Não edite arquivos, não execute Git mutável nem publique. Retorne um único
JSON válido com `verdict` (`PASS`, `REVIEW`, `FAIL`), `findings` (objetos com
`severity`, `file`, `issue`, `repair`) e `summary`.
