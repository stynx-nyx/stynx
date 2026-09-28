# STYNX 1.5.0 final — Inspector da rota de release

Declare `Inspector` na primeira linha. Use a worktree cumulativa
indicada pelo maestro. Leia `AGENTS.md` e as autoridades na ordem
exigida, `work/rounds/R-0002/final-release-context-contract.md`,
`scripts/lib/{release-context,registry-version-policy,publication-dist-tag}.mjs`,
`scripts/run-release-preparation.mjs`, `scripts/publish-release-plan.mjs`,
`law/policy/registry-version-anomalies.json` e as ODs no `plan.md`.
Use a política Architect final já commitada em `1a0d7a9a` como oráculo
para todos os campos de decisão e `supersedes`.
Escreva somente
`test/scripts/release-version-policy.test.mjs` e
`test/scripts/local-rc-blocker-contract.test.mjs`. Não execute Git,
commit, push, PR, publication, workflow dispatch, nem escreva no
DETRAN. Não altere implementação, política Architect, snapshots
gerados, trace ou fixtures fora do write set. Não enfraqueça testes.

Adicione prova pura de candidata final consolidada: `origin/main`
`1.5.0-rc.3` com pre mode `rc`, commits CTG Architect/Inspector/
Engineer antes de um marcador único
`chore(repo): version 1.5.0 final release`, commit de versionamento
com 44 pares manifesto/CHANGELOG, pre state e changesets consumidos,
raiz/template/SBOM sincronizados, HEAD `1.5.0` em 44 pacotes,
`pre.json` ausente e nenhum changeset pendente. O predicado deve
aceitar que o marcador não seja filho direto de `origin/main`.
O pai do marcador está em `mode=pre`; `pre exit`, versionamento e
READMEs entram no mesmo commit, que deleta `pre.json` e todos os
changesets não README do pai. Use o export puro separado
`isFinalVersionedCandidate` e a assinatura exata do contrato, sem
alterar `isVersionedPreModeCandidate`.
`markerCommits` é a cadeia completa de primeira parentalidade
base..head com `{sha,subject}`; `packageStates` contém
`{name,manifestPath,baseVersion,candidateVersion}`, com 44
`baseVersion=1.5.0-rc.3`. O pre state do pai do marcador precisa
ser estruturalmente igual ao de `origin/main`, inclusive versões
iniciais e lista de changesets; acrescente negativo de desvio.
Acrescente negativos para marcador ausente/duplicado, base errada,
versão divergente, roster 43/44, pre state retido, changeset pendente,
diff de versionamento incompleto e qualquer fonte, sensor ou
workflow alterado depois do marcador. Permita somente A/M em
`work/rounds/R-0002/**` e M em
`law/policy/forbidden-action-authorizations.json` após o marcador.
Prove que a classificação
final produz status vazio em vez de executar `changeset status`,
enquanto RC e version-PR legados preservam seus resultados.

Atualize os sensores do registry para candidata exata `1.5.0` e
última RC publicada `1.5.0-rc.2`: 44 manifestos e política concordam;
rc.3 ausente é válido, mas rc.2 precisa constar no histórico/tag;
`latest=1.4.0` é o preflight; depois `latest=1.5.0` e `rc=rc.2`
inalterado. Inclua colisão final, semver posterior, resposta sem
autenticação, ausência de rc.2, tag ausente/drift e 2.0.0 fora do
pacote/version ID autorizado. Preserve o objeto de evidência da
anomalia byte a byte exceto candidato e condição de fechamento.
O `owner_decision` Architect tem data 2026-09-28, baseline
`493fcd959592d30055dcacabd57e4cc19505f2c6`, tree
`9ef2f9350a67fec3d20d6d631669e4207ef6b636`, e `supersedes`
aponta a 2026-09-27/`1.5.0-rc.3`; a última RC publicada continua
`1.5.0-rc.2`.
Teste `pre.json` em modo `exit` rejeitado para publicação estável,
`pre.json` ausente aceito, e `npm publish --tag latest` somente para
stable. Os testes históricos RC2 continuam como prova de
regressão; renomeie apenas oráculos que representam a candidata atual.
No teste existente `current RC publication roster, old rc visibility,
bounded rereads, and stable-only release tags` (linha 1503), use
roster sintético de 44 manifestos na candidata estável `1.5.0` para
testar ordem, canário, visibilidade RC2 e releituras. Não exija que
o manifesto raiz e os manifestos reais estejam em RC antes do
marcador. `v1.5.0` é tag estável válida e `v1.5.0-rc.2` é recusada;
renomeie o teste para `final stable publication roster, rc2 visibility,
bounded rereads, and stable release tags` e avise o Architect para
rebind do trace. No negativo `PUBLICATION_VERSION_DRIFT`, mude o
manifesto sintético para `1.5.0-rc.3`, diferente da candidata;
`1.5.0` deixaria de ser drift. Remova apenas as linhas que derivam
candidato/RC da versão raiz e a igualdade dos manifestos reais nesse
teste. Preserve ordem, canário, releituras, drift de tags e demais
asserções; acrescente positivo pós-publicação com `latest=1.5.0` e
`rc=1.5.0-rc.2` intacto. A igualdade real do workspace fica só
no teste 345 renomeado.

Em `local-rc-blocker-contract.test.mjs`, faça a normalização do
manifesto raiz aceitar a forma estável exata `1.5.0` e os RCs
históricos `1.5.0-rc.N`, sempre normalizando somente a linha de
versão para o mesmo baseline congelado. Conserve o SHA-256 e a
comparação de todos os demais bytes; outros stable ou prereleases
continuam proibidos.

Rode os testes focais. Informe vermelhos esperados na fonte RC3 e
qualquer surpresa como triagem de uma linha. O maestro comita apenas
os dois arquivos de teste sob autoria Inspector e faz rebind de trace
em fase Architect. Não versione pacotes nem execute gate integral.
Depois da fonte Engineer e antes do marcador, apenas o teste renomeado
`final registry policy candidate equals the root and all 44 publishable manifest versions`
permanece vermelho porque os 44 manifestos ainda dizem `1.5.0-rc.3`.
Todos os outros testes focais devem estar verdes; após o marcador,
também esse teste passa.
