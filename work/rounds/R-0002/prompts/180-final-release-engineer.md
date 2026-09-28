# STYNX 1.5.0 final — Engineer da rota de release

Declare `Engineer` na primeira linha. Use a worktree cumulativa
indicada pelo maestro. Leia `AGENTS.md` e autoridades na ordem
exigida, `work/rounds/R-0002/final-release-context-contract.md`,
os sensores Inspector já commitados em
`test/scripts/release-version-policy.test.mjs` e
`test/scripts/local-rc-blocker-contract.test.mjs`, a política
Architect `law/policy/registry-version-anomalies.json` e os scripts
atuais de release. DETRAN é somente leitura. Escreva apenas
`scripts/lib/release-context.mjs`,
`scripts/run-release-preparation.mjs` e
`scripts/lib/registry-version-policy.mjs`, salvo autorização focal
do maestro para outro arquivo `scripts/` comprovadamente necessário.
Não execute Git, commit, push, PR, publicação ou workflow dispatch;
não altere tests, `law/`, docs, manifests, changesets, baselines ou
workflows. Não enfraqueça guardas nem crie shim.

Implemente um predicado puro e estreito de candidata final
consolidada. Reconheça base `1.5.0-rc.3` em pre mode `rc`, marcador
Conventional único
`chore(repo): version 1.5.0 final release` em cadeia de primeira
parentalidade após os commits CTG, diff do pai ao marcador com saída
completa do versionador (44 pares manifesto/CHANGELOG, retirada de
pre.json e changesets, raiz/template/SBOM), 44 manifestos e raiz
final `1.5.0`, nenhum changeset pendente e pre state ausente.
O pai do marcador conserva `pre.json` em `mode=pre,tag=rc`; `pre exit`,
versionamento e READMEs entram no mesmo commit, com D para pre.json e
todos os changesets não README do pai. Os arquivos de apoio M são
exatamente os seis do contrato; uma saída extra requer triagem Architect.
O pre state desse pai é estruturalmente igual ao de `origin/main`,
inclusive `initialVersions` e `changesets`. `markerCommits` é a
cadeia inteira de primeira parentalidade base..head com `{sha,subject}`;
`packageStates` traz `{name,manifestPath,baseVersion,candidateVersion}`
com 44 versões-base RC3.
Use o export separado `isFinalVersionedCandidate` com a assinatura
do contrato e preserve os classificadores RC e version-PR existentes.
A classificação não pode exigir que o
marcador seja filho direto de `origin/main`, nem aceitar pacotes,
scripts, testes, workflows ou lockfile alterados depois dele. Apenas
A/M em `work/rounds/R-0002/**` e M em
`law/policy/forbidden-action-authorizations.json` podem seguir.
Faça `release:status` gerar status vazio e a preparação de release
pular drafts só nesse contexto já versionado; outros contextos
preservam os fluxos RC e legados e falham fechado em desvio.

Em `registry-version-policy.mjs`, rebinda a candidata exata
`1.5.0` e o SHA-256 dos bytes da política Architect. Preserve
`previousCandidate=1.5.0-rc.2`, `preflightLatestVersion=1.4.0`,
roster 44, a exceção singular angular-profile@2.0.0 e as negativas
de histórico autenticado. O publisher já lê as constantes e
`publication-dist-tag.mjs` já suporta stable `latest` somente com
`preState=null`; não edite esses arquivos sem um vermelho concreto
e triagem ao maestro. Não aceite rc.3 remoto como pré-requisito.

Rode testes focais e lint/typecheck dos scripts pertinentes; informe
caminhos, símbolos e gates. Até o marcador, somente o teste
`final registry policy candidate equals the root and all 44 publishable manifest versions`
pode ficar vermelho porque os manifestos ainda são RC3; todos os
demais testes focais devem estar verdes. O maestro comita fonte como Engineer, versiona e
gera os 44 pacotes depois da convergência. Nenhum teste pode ser
alterado para fazê-lo passar.
