# STYNX 1.5.0 — contrato focal da candidata final consolidada

**Papel:** Architect. **Decisões Owner:** OD-S15-02 e OD-S15-03. A
CTG9 integra SIG/OBX/OFS; após ela haverá uma candidata estável, um
CI local integral, um PR, CI remoto e uma publicação final. Não há RC
nem PR intermediário. Este contrato não autoriza publicação: a ação
exige recibo específico que identifique comando e SHA exato de `main`.
Nenhum workflow será editado.

## Entrada e fronteira de versão

O ponto de partida da branch cumulativa é o `origin/main` no estado
`1.5.0-rc.3`, com Changesets em pre mode `rc`. Essa versão de workspace
não foi publicada; a última RC publicada é `1.5.0-rc.2` nos 44 pacotes.
O registro remoto esperado antes da publicação final é `latest=1.4.0`
e `rc=1.5.0-rc.2` em cada pacote. O preflight autenticado deve
observar os 44, a versão final `1.5.0` ausente, e a exceção singular
`@stynx-nyx/angular-profile@2.0.0` exatamente como adjudicada.

Depois que CTG9, contratos, sensores, fonte, baselines, trace e
changesets estiverem fechados, executar `pnpm changeset pre exit`,
conferir `pnpm release:preview` com projeção `1.5.0`, executar
`pnpm version-packages` e `pnpm package-readmes:write`. O resultado
deve conter `1.5.0` no manifesto raiz e em cada um dos 44 manifestos
publicáveis, ranges internos/template e CHANGELOGs sincronizados,
SBOM gerado, `.changeset/pre.json` ausente e nenhum `.changeset/*.md`
pendente além de `README.md`. O commit de versão tem assunto
**`chore(repo): version 1.5.0 final release`** e autoria Engineer.
O marcador deve ocorrer uma vez na cadeia de primeira parentalidade
da branch, após os commits Architect/Inspector/Engineer das CTGs.
Não reordenar, esmagar ou combinar commits de papéis para satisfazer
um classificador legado.
As três operações (`pre exit`, versionamento e READMEs) ficam na árvore
de trabalho até o **mesmo** commit marcador. O pai desse commit conserva
`.changeset/pre.json` em `mode=pre, tag=rc`; o diff do marcador remove
esse arquivo e exatamente todos os `.changeset/*.md` não README
presentes no pai, sem criar outro changeset. Pai em `mode=exit` é inválido.
O pre state do pai é estruturalmente igual ao `pre.json` de
`origin/main`, inclusive `initialVersions` e `changesets`; novos
changesets da CTG entram em arquivos `.md`, não alteram essa lista
antes do versionamento.
SBOM, CHANGELOGs e READMEs são saídas determinísticas do verbo de
versionamento, sem edição manual; essa é a atribuição Engineer do commit.

### Reparo do exit de pre mode para pacotes privados

Na primeira tentativa de `pnpm version-packages` depois de `pre exit`, o
Changesets nativo alterou manifestos de pacotes privados apesar de
`privatePackages.version=false` no config: por exemplo,
`tools/image-size-safe` passou de `2.0.3-stynx.1` a `2.0.3` e o SBOM
falhou. A tentativa parcial foi restaurada integralmente ao HEAD
`5dffc830` antes de qualquer marcador. O wrapper de versionamento deve
capturar, antes de `changeset version`, os bytes de `package.json` e
`CHANGELOG.md` (inclusive ausência) de cada pacote workspace com
`private:true`, exceto o manifesto raiz; após o Changesets nativo e
antes do SBOM, deve restaurá-los exatamente e remover apenas CHANGELOGs
privados criados por essa invocação. Descubra pacotes pelas raízes do
`pnpm-workspace.yaml` sem percorrer `node_modules`/`dist`. Não restaure
manifestos/CHANGELOGs dos 44 pacotes públicos, nem edite saídas geradas
à mão. Um fixture Inspector deve provar restauração privada, inclusive
fork `image-size` e CHANGELOG pré-existente/ausente, mantendo intocados
manifesto e CHANGELOG públicos. Prove também a ligação do wrapper: captura
antes do subprocesso Changesets e restauração mesmo quando ele falha,
antes de validação, correção do grupo fixo, sincronização e SBOM. O fixture
cobre `domain/*/api`, `docs/site`, pacote privado sem `version` e decoys
em `node_modules`/`dist`. Restaure byte a byte `reference/api` e
`reference/web`, cujos hashes estão congelados em
`test/scripts/local-rc-blocker-contract.test.mjs`; não rebinde esses hashes.
O subprocesso `changeset version` não pode usar o helper `run()` que chama
`process.exit` antes da restauração. Capture o status via `spawnSync`,
restaure em `finally` e só então propague o status original. Inspector
prova esse caminho com subprocesso simulado ou verificação estrutural que
rejeite explicitamente o uso de `run()` nesse ponto e a saída antecipada.
`status:null` ou `error` de spawn são falhas. Se a restauração falhar,
reporte tanto o resultado Changesets quanto todos os arquivos cuja
restauração falhou, e saia com erro. A checagem de diff privado cobre
somente manifestos/CHANGELOGs raiz dos pacotes workspace privados; o
template `tools/create-stynx-app/template/package.json` permanece saída
de apoio permitida.
Depois do PASS Engineer, Architect executa `pnpm check:trace --print`,
rebinda `law/trace.json` e commita como `DEVAI Architect` antes de repetir
`pre exit` e o versionamento. Após versionar, confira que `git diff` não
inclui `package.json`/`CHANGELOG.md` de pacotes privados. O marcador final continua limitado aos
44 pares públicos, arquivos de apoio permitidos e exclusão de pre state/
changesets; nenhum manifesto/CHANGELOG privado aparece em seu diff.

## Classificação de release já versionada

O workflow de release-prep executa `pnpm release:status`; este chama
`scripts/run-release-preparation.mjs --release-status`. Na branch
final, o classificador existente vê `pre.json` ausente e não reconhece
os commits de papéis antes de `ci: version packages`; classificá-la
como ordinária chamaria `changeset status --since origin/main` sobre
pacotes modificados sem changesets pendentes. A mesma classificação
é usada por `pnpm ci:stynx:release`. O reparo é um caminho estreito
para a candidata final, sem mudança no workflow ou na classificação
das RCs e dos PRs de versão legados.

Adicionar um predicado puro em `scripts/lib/release-context.mjs` e
chamá-lo em `scripts/run-release-preparation.mjs` antes de recorrer
ao caminho ordinário. Ele deve aceitar somente a cadeia com um
marcador final exato, raiz `1.5.0`, 44 manifestos publicáveis em
`1.5.0`, base `1.5.0-rc.3` em pre mode `rc`, `pre.json` final ausente,
nenhum changeset pendente, e um diff do **pai do marcador ao marcador**
que contém a saída de versionamento: retirada do pre state e dos
changesets consumidos, 44 pares manifesto/CHANGELOG alterados,
manifesto raiz, template e SBOM sincronizados. Os arquivos de apoio
com status M são exatamente `docs/meta/security/sbom.cdx.json`,
`package.json`, `tools/create-stynx-app/template/package.json` e os
READMEs de `packages/pdf`, `packages/pdf-a` e
`packages/pdf-a-vera-docker`. Qualquer saída extra encontrada na
execução real é triada pelo Architect antes de alargar esse conjunto.
O diff do base ao marcador pode conter as CTGs e não substitui esse
teste do commit de versão.

Entre o marcador e o HEAD do PR, só se admitem alterações A/M em
`work/rounds/R-0002/**` e alteração M em
`law/policy/forbidden-action-authorizations.json`. Nenhuma prova DEVAI
gerada é admitida nesse intervalo; produzi-la antes do marcador ou
registrá-la no merge, conforme a fase de Auditor. Em particular, não
alterar `packages/`, `packages-web/`, `scripts/`, `tools/`, `test/`,
`.changeset/`, `package.json`, `pnpm-lock.yaml` ou workflows. Os 44
manifestos e a versão precisam
permanecer idênticos. Alteração adicional de código ou sensor volta
ao ciclo de versão e gate, nunca é escondida como follow-up. A
classificação final não depende de nome de branch ou da presença de
um PR. Em checkout de merge sintético, use o segundo pai somente
quando o primeiro for o `origin/main` exato, como o resolver já faz.
O resultado é um contexto não ordinário: `release:status` grava
status vazio e release-preparation pula drafts de changesets já
consumidos. Qualquer desvio falha fechado ou permanece ordinário;
nenhum desvio pode ser promovido a candidata publicável.

## Política do registry e dist-tags

O Architect rebinda `law/policy/registry-version-anomalies.json` para
`next_unified_version=1.5.0` e
`anomalies[0].allowed_candidate=1.5.0`; mantém identidade, versão,
version ID, integridade, SHA-256, remediação e escopo singular da
anomalia 2.0.0. A decisão tem `date=2026-09-28`,
`repository_baseline=493fcd959592d30055dcacabd57e4cc19505f2c6`,
`repository_tree=9ef2f9350a67fec3d20d6d631669e4207ef6b636` e
`supersedes={date:2026-09-27,next_unified_version:1.5.0-rc.3}`.
O statement fixa OD-S15-02/03, `rc.3` somente no workspace,
`rc.2` como última RC publicada, `latest=1.4.0` no preflight,
dist-tag `latest` da final e recibo Owner por SHA exato. Esses bytes
foram commitados pelo Architect em `1a0d7a9a` antes do Inspector.
A condição
de fechamento requer 44 pacotes em `1.5.0`, `latest=1.5.0`,
`rc=1.5.0-rc.2` e 2.0.0 imutável não canônico. O Engineer rebinda
o SHA-256 exato da política em
`scripts/lib/registry-version-policy.mjs` e muda somente a constante
`candidate` para `1.5.0`; `previousCandidate` permanece
`1.5.0-rc.2`, `preflightLatestVersion` permanece `1.4.0` e o roster
permanece 44. Não exija `rc.3` remoto. A monotonicidade aceita todo
prerelease anterior a `1.5.0`, recusa colisão de `1.5.0`, versão
canônica posterior, ausência de `rc.2`, resposta não autenticada,
drift de tags ou anomalia fora da exceção exata.

`scripts/lib/publication-dist-tag.mjs` já seleciona `latest` para
versão estável somente com `preState=null`; `publish-release-plan.mjs`
já consome a candidata e a RC anterior das constantes. Preserve esses
guards: preflight exige `latest=1.4.0` e `rc=1.5.0-rc.2`; a
publicação usa `npm publish --tag latest --access restricted` para
os 44 tarballs, começa por `@stynx-nyx/angular`, compara integridade
e para na primeira falha ou observação ambígua. Pós-publicação,
somente `latest` pode mudar para `1.5.0`; `rc` e demais tags
permanecem byte a byte iguais. Publique somente de `main` no SHA
autorizado, depois dos gates e de um único check `k6` bem-sucedido
para esse SHA (`scenario=all`), pois `verify-missing-evidence.mjs`
exige essa prova exata.

## Sensores, papéis e checkpoints

O predicado puro separado chama-se `isFinalVersionedCandidate` e recebe
`{baseRootVersion,basePreState,markerCommits,markerParentPreState,markerChanges,followUpChanges,candidateRootVersion,packageStates,changesetIdsOnDisk,preState}`.
`isVersionedPreModeCandidate` e `classifyReleaseContext` conservam o
comportamento atual; os valores da final são literais exatos de 1.5.0,
não uma regra genérica.
`markerCommits` é a cadeia completa `rev-list --first-parent --reverse
base..head`, com `{sha,subject}` por commit. `packageStates` usa a
forma existente `{name,manifestPath,baseVersion,candidateVersion}`;
o `baseVersion` de cada pacote vem de `origin/main` e é
`1.5.0-rc.3`.

Antes de qualquer escrita Inspector/Engineer, obtenha prompt-review
`PASS` do Claude Code Opus 5.5 sobre este contrato e os prompts 179
e 180. A política Architect `1a0d7a9a` precede o despacho Inspector.
Inspector altera apenas
`test/scripts/release-version-policy.test.mjs` e
`test/scripts/local-rc-blocker-contract.test.mjs`: caso positivo
multicommits de papéis com marcador final tardio; negativos de
marcador ausente/duplicado, versão divergente, 43/44 manifestos,
pre state presente, changeset pendente, diff de versão incompleto e
alteração de fonte após marcador; candidatos/monotonicidade/tags
finais e preservação da exceção; normalização do hash congelado do
manifesto raiz para aceitar `1.5.0` sem afrouxar outros bytes.
O sensor atual `current RC publication roster, old rc visibility, bounded
rereads, and stable-only release tags` (linha 1503) vira prova da
candidata estável: usa a candidata `1.5.0` da política e roster
sintético de 44 pacotes nessa versão para ordem, canário e releituras;
`previousCandidate` continua RC2. Não lê versão RC do manifesto raiz
nem a exige nos manifestos antes do marcador. `v1.5.0` é tag estável
válida; `v1.5.0-rc.2` é recusada como tag estável. Renomeie o teste
para `final stable publication roster, rc2 visibility, bounded rereads,
and stable release tags` e rebinda seu título no trace. O negativo
`PUBLICATION_VERSION_DRIFT` muda o manifesto sintético para o literal
`1.5.0-rc.3`, que difere da candidata final; a mutação antiga para
`1.5.0` seria igual à candidata e perderia o sentido. Remova apenas
as linhas que derivam candidato/RC anterior da versão raiz e a
igualdade dos manifestos **reais** nesse teste; mantenha as demais
asserções de ordem, canário, releituras, drift de tags e erro.
Acrescente o positivo pós-publicação `latest=1.5.0` com
`rc=1.5.0-rc.2` inalterado. A igualdade do
workspace real fica exclusivamente no teste da linha 345 renomeado.
Depois do Engineer e antes do marcador de versão, somente o teste
`final registry policy candidate equals the root and all 44 publishable manifest versions`
(antigo teste RC3 na linha 345) permanece vermelho: os manifestos
ainda dizem `1.5.0-rc.3`, embora a política diga `1.5.0`. Todos os
demais testes focais devem estar verdes; qualquer outro vermelho é
defeito e impede o versionamento. Depois do marcador todos passam.
As assertions históricas RC ficam intactas. O maestro comita só Inspector.

Architect já comitou a política JSON em `law/` separadamente e rebinda
`law/trace.json` depois dos sensores. Engineer altera somente os
scripts de classificador/política necessários, preserva o modo RC,
executa testes focais, lint e typecheck. O maestro faz commit só
Engineer; a geração da versão final é outra operação Engineer, após
convergência das tríades. Depois, `pnpm check:trace --print`,
`pnpm release:status`, `pnpm release:policy`,
`pnpm release:provenance` e `pnpm release:consumer-fixtures`
precisam passar sobre o HEAD final, além do único CI integral da
OD-S15-02/03 e review de entrega. O PR e a publicação permanecem
bloqueados por MUST faltante, review não PASS, gate vermelho ou
recibo Owner ausente para a ação exata.
