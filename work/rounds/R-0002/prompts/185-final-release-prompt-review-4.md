# STYNX 1.5.0 final — prompt-review focal 4

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia `AGENTS.md`, o contrato
`work/rounds/R-0002/final-release-context-contract.md`, prompt 179,
`reviews/final-release-prompt-review-3.bridge.json` e o teste
`test/scripts/release-version-policy.test.mjs` na faixa 345 e
1503–1557. Não edite, não execute Git e não publique.

O ciclo 3 encontrou um único bloqueio: o negativo
`PUBLICATION_VERSION_DRIFT` mutava para 1.5.0, que seria igual à nova
candidata. Confirme que contrato/prompt agora exigem 1.5.0-rc.3 nesse
negativo, removem somente a derivação da versão raiz/igualdade dos
manifestos reais no teste 1503, mantêm os demais asserts, renomeiam
o título com rebind de trace, e provam latest=1.5.0 com rc=rc.2
inalterado. Confirme que o único vermelho esperado antes do marcador
continua sendo o teste 345 de igualdade real. PASS libera o Inspector
para escrever sensores; não declara release ou publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
