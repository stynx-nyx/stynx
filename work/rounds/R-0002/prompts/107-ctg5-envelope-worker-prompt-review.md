# CTG-0005 envelope — prompt-review dos workers

Você é Claude Code Opus 5.5, reviewer independente e somente leitura. Leia
`AGENTS.md` e suas autoridades em ordem, a proposta Architect
`work/rounds/R-0002/ctg5-error-envelope-option-a.md`, o PASS técnico
`reviews/ctg5-error-envelope-option-a-review-4.json`, os prompts Inspector
105 e Engineer 106, a fonte e os testes reais CTG5. Confira se os prompts
traduzem integralmente o contrato aprovado tecnicamente, inclusive as quatro
precisões baixas do PASS, e se mantêm locks, papéis, testes negativos, 504 e
503 legados, dois 422, 502 escolhido pelo consumidor, RLS e review de
entrega. Verifique que nenhum worker pode começar sem decisão do Owner para
`INV-ERROR-001` e que a entrega não antecipa PR/RC/CI completo sob OD-S15-02.

Não edite arquivos, não execute Git mutável nem publique. Retorne um único
JSON válido com `verdict` (`PASS`, `REVIEW`, `FAIL`), `findings` (objetos com
`severity`, `file`, `issue`, `repair`) e `summary`. Um PASS técnico do prompt
não substitui a aprovação humana da opção A.
