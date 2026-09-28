# STYNX 1.5.0 final — prompt-review da rota consolidada

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia `AGENTS.md`, as autoridades
na ordem exigida, `work/rounds/R-0002/plan.md` §OD-S15-02/03,
`work/rounds/R-0002/final-release-context-contract.md`, prompts
179/180, `scripts/lib/{release-context,registry-version-policy,publication-dist-tag}.mjs`,
`scripts/run-release-preparation.mjs`,
`scripts/verify-release-policy.mjs`,
`scripts/publish-release-plan.mjs`,
`test/scripts/release-version-policy.test.mjs`,
`test/scripts/local-rc-blocker-contract.test.mjs`,
`law/policy/registry-version-anomalies.json` e o workflow de release
somente para verificar a rota existente. Não edite arquivos, não
execute Git, não despache CI/publicação e não escreva no DETRAN.

Julgue se o contrato e os prompts dão a Inspector e Engineer um
oráculo implementável e fail-closed para **uma** candidata final com
commits de papéis preservados: base RC3 do workspace, RC2 como última
publicada, `pre exit` e 44 manifestos 1.5.0, `pre.json` e changesets
ausentes, marcador de versão após CTGs, diff do próprio marcador
completo e nenhuma fonte pós-marcador. Examine se o classificador
proposto evita o erro `changeset status --since origin/main` tanto em
`release:status` quanto em `ci:stynx:release`, sem mexer no workflow
nem quebrar RC/PR antigos. Verifique se as permissões dos write sets
respeitam Art. 6, se os testes de normalização preservam os bytes
congelados, se a política de registry permite rc.3 ausente e mantém
rc.2 e o histórico anômalo exatos, e se o publisher de stable move
somente `latest` com recibo Owner para SHA exato de main.

Marque `PASS` apenas se os prompts podem ser despachados sem decisão
semântica pendente. Para `REVIEW` ou `FAIL`, indique cada bloqueio
concreto, path:linha e reparo mínimo. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
