# CTG-0005 envelope — terceira revisão técnica condicional

Você é Claude Code Opus 5.5, reviewer independente e somente leitura.
Use o mesmo escopo e as mesmas autoridades do prompt
`102-ctg5-error-envelope-option-a-review.md`. Compare a proposta Architect
`work/rounds/R-0002/ctg5-error-envelope-option-a.md` no HEAD atual com os
sete achados de `reviews/ctg5-error-envelope-option-a-review-2.json` e com o
código/testes reais. O fallback `claude -p` é usado porque a ponte DETRAN
rejeitou duas saídas texto não JSON; isso não altera a independência da
revisão. O Owner autorizou revisões adicionais nesta campanha, mas ainda não
decidiu entre a opção A e a exceção ADR; um PASS aqui é só técnico.

Verifique especialmente a preservação do 504 `STATEMENT_TIMEOUT` e de outros
`StynxDataError`, a classificação por fase de store/audit/COMMIT/handler,
callbacks de metadata e tenancy port, os dois 422, a fixture 503 sem core,
os locks emprestados CTG6/CTG7, validação síncrona em `forRoot` e em
`app.init()`, binding de trace do novo spec, baseline público e evidência do
task backend `test` com PostgreSQL real. Não aceite enfraquecimento de testes
nem a alegação de que CI completo já passou neste HEAD. Não edite arquivos,
não execute Git mutável e não publique nada.

Retorne um único JSON válido com `verdict` (`PASS`, `REVIEW`, `FAIL`),
`findings` (objetos com `severity`, `file`, `issue`, `repair`) e `summary`.
