---
schemaVersion: '1.0.0'
id: 'R-0002'
title: 'STYNX 1.5.0 — upstream DETRAN C-0002'
type: 'release'
kind: 'implementation'
status: 'active'
date: '2026-09-26'
authority: 'Architect'
goal: 'Entregar os 15 candidatos U1–U15 da especificação C-0002 como STYNX 1.5.0.'
isolation:
  kind: 'git-worktree'
  branch: 'feat/release-1-5-0'
  base_sha: '75b9966a887192121a3904fef7cfd211f8e94465'
orchestrator_prompt: 'prompts/00-maestro.md'
plan_path: 'plan.md'
---

# R-0002 — registro de execução

## Estado

Bootstrap verde após provisionar os serviços Docker da referência e o Chromium
headless do Playwright. `pnpm ci:stynx` passou com PostgreSQL na porta 55432 e
`pnpm exec devai doctor` retornou `ok: true` antes da tríade. Ver `plan.md`
§Linha de base.

## Revisões

Prompt-review do CTG-0001 por Claude Code `claude-opus-5-5` via ponte DETRAN:
dois ciclos, ambos `REVIEW`. O primeiro trouxe oito achados; o segundo
confirmou a correção dos oito e apontou um bloqueio restante sobre o UUID do
ator nominal, além de sete ajustes não bloqueantes. Plano e prompts foram
corrigidos após o segundo ciclo. O limite de dois ciclos `REVIEW` do prompt do
maestro foi atingido. O Owner autorizou uma terceira verificação excepcional
em 2026-09-26 (“Autorizado”); executar prompt 05 pela ponte antes de qualquer
despacho.
O terceiro prompt-review excepcional retornou `PASS`, com três observações
não bloqueantes incorporadas ao contrato Architect. Despacho liberado.
Worker Architect `gpt-6-sol` entregou F1, commit
`94d62ccb637a4fb6d5e5942a383235145d7e1a9b` com autoria `DEVAI Architect`.
Worker Inspector `gpt-5.6-terra` entregou sensores F3, commit
`c6f8b7fde4b450a3b4a5a8857b334b13af7617d4` com autoria
`DEVAI Inspector`. Testes focalizados falham como esperado antes da
implementação; `pnpm lint:tests`, `check:rls-negative` e `check:rls-smoke`
passaram. `pnpm check:trace --print` projetou seis novos sensores e seis
digests alterados; o rebind Architect em `law/trace.json` passou com 387/387.
O primeiro rebind foi commitado em `7170c89c`. O Engineer `gpt-6-sol` iniciou
F2. A revisão dos sensores identificou duas falhas de teste, sem alteração de
produto para acomodá-las: a role superusuária que contornava RLS em auditoria
e a localização aninhada das opções de `nestjs-cls`. O Inspector corrigiu as
duas em `1cd9bee7`; a integração pública com PostgreSQL passou 35/35,
`lint:tests` passou e o novo rebind do trace passou 387/387.
O review de código apontou downgrade indevido para público após falha de cache
ou mapper em um token já verificado. O Inspector acrescentou duas negativas
em `7d513da7`; elas falham na implementação inicial como esperado. O
Engineer está corrigindo a causa. O rebind Architect atualizado continua
387/387.
O Engineer corrigiu o downgrade, e auth 212/212, backend 292/292, integração
auth 23/23 e tenancy PostgreSQL 35/35 passaram. O commit F2 é `2a94cac0`.
`pnpm release:preview` calculou bump minor do grupo fixo para 1.5.0 apesar da
inferência major do `changeset status` bruto; `scripts/version-packages.mjs`
trata essa promoção indevida. `pnpm api:baselines:write` atualizou as
declarações públicas e `pnpm package-readmes:write` teve zero mudanças.
O rebind da API pública e o checkpoint foram commitados em `e6330a81`.
`pnpm ci:stynx` passou nesse HEAD com PostgreSQL real em `127.0.0.1:55432`:
incluiu 51 tarefas de integração, 48 de build, RLS negativo e smoke.
O delivery-review Opus 5.5 via ponte DETRAN, ciclo 1, retornou `REVIEW`:
três lacunas bloqueantes de sensores HTTP (duas ordens de módulo, ambos os
guards reais e provas de contexto) e seis achados adicionais de contrato,
código ou fixture RLS. O PR fica pendente do reparo, novo CI e PASS.
O contrato de reparo foi commitado em `d3a1b3db`, `51c2ca1b` e `8db9a681`.
Os Inspectors Codex acrescentaram oito arquivos de sensor em `bc9a8559`:
ordens HTTP core/tenancy, guards reais com tenancy, apps auth/backend sem
tenancy, bootstrap herdado, permissão nominal, cabeçalho configurado,
comparação de UUID e controle positivo/negativo de RLS como `stynx_app`.
Dois 500 iniciais eram montagem de fixture (guard sem `@Injectable()` e stub
de `SessionService` ausente) e foram corrigidos sem tocar produto. Os novos
sensores deixam explícitas as falhas de produto de entitlement, sessão
verificada backend, `@ReadOnly`, permissão nominal, marcador herdado e caixa
do UUID. `pnpm lint:tests` passou após correção de um import não usado
capturado pelo hook. A entrega do Engineer e novo rebind de trace seguem
pendentes.
O rebind dos oito sensores passou 393/393 em `7fb91e18`. A revisão interna do
diff Engineer revelou dois riscos não cobertos: regressão de `@Public()`
legado com `@Permission` e identidade residual em `AuthContextGuard` opcional
com token ausente/inválido. O Inspector os fixou em sensores que falham no
código atual, commit `d9bfda3e`. O contrato foi precisado em `adbdb3cd`;
rebind Architect e correção Engineer seguem.
Os reparos de código foram commitados em `62ca16fd` e o baseline de API em
`f340aca5`. `pnpm ci:stynx` passou nesse HEAD: 97/97 tarefas de teste,
51/51 de integração, 48/48 de build, 37/37 testes de tenancy com PostgreSQL,
RLS negativo e smoke. `pnpm release:preview` continua a projetar minor 1.5.0;
a §8 do DETRAN e seu HEAD permanecem sem adendas/alteração. A verificação
DEVAI `forbidden-actions` sobre o intervalo desde o baseline passou sem
achados. Delivery-review Opus 5.5 ciclo 2 retornou `REVIEW` com duas lacunas
bloqueantes: distinguir falha de infraestrutura de credencial inválida e
provar sessão revogada/limpeza/permissão concedida no guard STYNX. Três
observações adicionais pedem prova da ordem real dos interceptors, proveniência
compartilhada e claims Cognito. Tarefa escalada para nova tríade focal;
nenhum PR foi aberto.
O Architect fixou o contrato da tríade focal em `6745d3fe`: rejeição definitiva
de credencial usa `InvalidCredentialError`, falhas de JWKS/configuração se
propagam, e ambos os guards produzem um marcador compartilhado de proveniência.
O Inspector entregou os sensores em `854ad19e`: os dois ordenamentos reais de
interceptors, ID gerado visto no guard/handler/resposta, erros de verificação,
claims Cognito, permissão concedida, sessão revogada e identidade anterior.
As falhas observadas no código anterior são específicas ao contrato; `lint:tests`
passou. O Architect atualizou `law/trace.json` em `2902e545`, com
`pnpm check:trace --print` verde em 393/393. O Engineer iniciou o reparo focal;
CI e novo delivery-review ainda estão pendentes.
O Inspector alinhou fixtures de credencial e proveniência em `660a385c`,
sem enfraquecer as negativas de infraestrutura; o rebind Architect está em
`15756316`. O Engineer concluiu o reparo de código em `d6f76e8b` e o
Architect rebindou as declarações em `086c3f7c`. O `pnpm ci:stynx` passou
nesse SHA, com testes 97/97, integração 51/51, build 48/48, baseline API
44/44, trace 393/393 e RLS negativo/smoke. `pnpm release:preview` projeta
1.5.0 minor, READMEs gerados não mudaram e o check DEVAI de ações proibidas
não encontrou achados. Um digest de `data/src/schema/flow.d.ts` na entrada
backend do baseline mudou apenas por ordem de membros de uma união emitida
pelo TypeScript após a mudança do programa backend; nenhum código ou
contrato da API de data/flow mudou.
O delivery-review Opus 5.5 ciclo 3 retornou `REVIEW`: a inversão de
interceptors era aplicada depois de `app.init()` e não observada na cadeia
servida; JWKS vazio era confundido com assinatura inválida; e faltam provas
HTTP/JOSE de ramos de erro tipado e sessão revogada. O parecer também pede
melhor cobertura de limpeza de marcadores, claim upstream divergente e
permissão sem concessão pelo AuthContextGuard. Nova tríade focal registrada
em `plan.md` §Triagem. Nenhum PR foi aberto.
O Inspector corrigiu a prova das duas ordens reais em `5ce78eea` e acrescentou
os sensores de JWKS/JOSE/HTTP em `0cf2c9ee`; o Architect rebindou o trace
em `e853a966`. O Engineer corrigiu fonte de chaves e refresh em `03469868`;
o baseline de API está em `3314eb69`. O CI integral passou nesse HEAD:
trace 393/393, API 44/44, auth 232/232, tenancy PostgreSQL 39/39, RLS
negativo/smoke, testes 97/97, integração 51/51 e build 48/48.
O delivery-review Opus 5.5 ciclo 4 retornou `REVIEW` com um bloqueio:
assinatura inválida contra JWKS recém-atualizado dentro da janela de 30 s
era tratada como falha ambígua, causando 500 em vez de modo público. Dois
ajustes de sensor não bloqueantes pedem falha de refresh por `jwksUri`, HTTP
de JWKS no guard STYNX e tabela JOSE completa. O contrato e a triagem foram
atualizados antes da nova tentativa; nenhum PR foi aberto.

O Inspector commitou os sensores do ciclo 4 em `57288b8d`: assinatura
inválida no JWKS recém-atualizado, refresh `jwksUri` falho com restauração
de `fetch`, supressão após falha, erro HTTP STYNX JWKS e códigos JOSE
restantes. O Architect fez o rebind de `law/trace.json` em `d840448d`
(393/393). O Engineer corrigiu o classificador e preservou o cache mais
novo sob concorrência em `e4253237`. `pnpm api:baselines:write` e
`pnpm package-readmes:write` não alteraram arquivos. CI integral nesse
SHA passou: API 44/44, auth 234/234, tenancy PostgreSQL 39/39, testes
97/97 tarefas, integração 51/51 e build 48/48; log
`/private/tmp/stynx-s15-ctg1-ci-review5.log`. `pnpm release:preview`
mantém 1.4.0 → 1.5.0 minor. Check DEVAI forbidden-actions passou sem
findings. Quinto delivery-review pendente; nenhum PR aberto.

O quinto delivery-review Opus 5.5 via ponte DETRAN retornou `PASS` em
`reviews/ctg-0001-delivery-review-5.json`, resolvendo todos os achados
do ciclo 4. Uma observação não bloqueante recomenda um teste de interleaving
para o fast path de cache JWKS já conferido pelo reviewer no código. Não
há desvio MUST conhecido no CTG-0001. PR e CI remoto pendentes.

O PR [#272](https://github.com/stynx-nyx/stynx/pull/272) abriu no
`06ee0eec` após `PASS`. O primeiro CI remoto sinalizou dois checks
vermelhos de release prep. O SARIF do Semgrep identificou somente o JWT
fictício literal do teste `stynx-auth.guard.spec.ts`; o Inspector passou
a montá-lo em runtime (`f36fe73e`) sem mudar a asserção, com 11/11 e
`lint:tests` verdes. O Architect rebindou somente o digest desse sensor
em `law/trace.json` (`5cf54f8e`, 393/393). O `dependency-audit` apontou
o override raiz herdado `adm-zip@0.6.0`, transitivo de
`github-actionlint@1.7.12`; o Engineer atualizou override e lockfile
para 0.6.1 corrigido (`1ac5c50d`). Instalação congelada, `pnpm audit
--audit-level high` e `pnpm lint:workflows` passaram. Nenhum workflow
foi editado. CI completo e review do delta pendentes antes do push.

O rebuild integral após atualizar o lockfile revelou um link relativo
quebrado em `docs/framework/contracts/tenancy-context-1.5.md` quando o
gerador copia o contrato para `site-docs/contracts`. O Architect substituiu
o destino pela nota de migração no repositório; o build isolado do site
passou, e novo CI integral está pendente. A falha foi classificada como `plant-bug` em
`plan.md` §Triagem, sem alteração de workflow ou teste.

O CI seguinte chegou aos testes de scripts e achou três pins D21/D22/D16.1
do SHA anterior do `package.json` raiz. O Inspector refez somente esses
três pins em `43093989` para o SHA exato
`5d4fc38a8f4e538aa2bda99e37b20cdbe13c5ab1f8149622f18e45dd256467fd`,
sem alterar a comparação, os outros caminhos ou os testes de comportamento.
Os três testes focais passaram; lint de scripts e trace 393/393 passaram.
CI integral passou em `43093989`: trace 393/393, API 44/44, auth
234/234, tenancy PostgreSQL 39/39, testes 97/97 tarefas, integração
51/51 e build 48/48; log
`/private/tmp/stynx-s15-ctg1-ci-pr-repair3.log`. Review do delta e
novo push pendentes.

O delivery-review Opus 5.5 ciclo 6 retornou `PASS` para o delta do PR,
confirmando o veredito do ciclo 5. O reviewer verificou que o fixture
mantém o token byte a byte, o override é dependência de desenvolvimento,
os três pins continuam SHA exato e o CI novo passou. Uma nota não
bloqueante recomenda estabilizar o link de migração com a tag `v1.5.0`
após a final. Push e CI remoto ainda pendentes.

O PR #272 passou todos os checks obrigatórios no SHA `52a01eaa` e foi
mesclado com merge commit
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a` em 2026-09-26.
O maestro registrou a prova DEVAI `evidence record --kind generic`
da rodada (sequência 1) e executou `audit observe --at` nesse SHA
como Auditor; a observação concluiu sem promoção e a cadeia de
evidências passou em `evidence verify --scope chain`. Os artefatos foram
commitados separadamente em `07b3cb47` na branch de preparação da RC.

## Escopo condicional

UPS-SIG, UPS-OBX e UPS-OFS estão fora da release enquanto a §8 da especificação
não contiver adenda confirmatória da R-0021 com nível decidido pelo Owner.
Na leitura de 2026-09-26, a §8 não continha adendas. Conferir novamente antes
de congelar o escopo.
Nova conferência em 2026-09-26 no HEAD DETRAN
`220a40202bf4ab17a5ce28b882ad96d60755842f`: §8 ainda declara
"Sem adendas". UPS-SIG/OBX/OFS continuam condicionais e fora do escopo
atual, sujeitas a nova leitura antes do congelamento final.

## Preparação RC1 e publicações

Após o merge CTG-0001, `pnpm changeset pre enter rc` foi executado. Um
ensaio de `pnpm version-packages` expôs bug do versionador: o Changesets
gerou `2.0.0-rc.0` e a regra local corrigiu para `1.5.0` estável. Os
arquivos gerados foram restaurados; `pre.json` voltou ao estado de
entrada com `changesets: []` e foi commitado em `c011d259`. O
prompt-review Opus do reparo recebeu REVIEW em dois ciclos, ambos
registrados em `reviews/rc1-version-prompt-review-{1,2}.json`. O
Owner autorizou o terceiro prompt-review excepcional do RC1; nenhum
worker RC foi despachado até seu veredito. A publicação RC requer corrigir
a rota atual que fixa `--tag latest` e `candidate 1.4.0`.
O terceiro prompt-review excepcional retornou **PASS** em
`reviews/rc1-version-prompt-review-3.json`; quatro observações não
bloqueantes foram incorporadas ao contrato dos workers antes do despacho.
O Inspector registrou testes RC1 em `61bc7a4f` (cinco falhas esperadas,
duas provas de reescrita verdes); Architect rebindou o trace em
`8c444f40`. Engineer corrigiu o versionador em `fb49616b` (36/36
testes, preview 1.4.0 → 1.5.0-rc.1). `pnpm version-packages` gerou os
44 pacotes em 1.5.0-rc.1 e foi commitado em `1e9bf5c4`; Inspector
rebindou exatamente três pins do manifesto raiz em `f4bbcb2d`.
`pnpm release:preview` ficou no-op, `pnpm release:policy` e trace
393/393 passaram. CI integral e delivery-review seguem em execução.
Prompt-review da rota de publicação retornou REVIEW nos ciclos 1 e 2;
o contrato foi reparado, mas o limite de ciclos exige nova autorização
do Owner antes de uma terceira submissão. Nenhuma publicação ocorreu.
CI integral da candidata versionada passou com exit 0 no SHA
`f4bbcb2d071dcbe08390987377c4d9af231aae88`, comando com
`STYNX_TEST_PG_HOST=127.0.0.1`, porta `55432`, usuário/senha
`postgres` e `pnpm ci:stynx`; log
`/private/tmp/stynx-s15-rc1-ci.log`. Trace 393/393, scripts 114/114,
test 97/97, integração 51/51, build 48/48 e doctor/RLS passaram.
Delivery-review Opus do versionamento ciclo 1: **PASS** em
`reviews/rc1-version-delivery-review-1.json`, com dois casos futuros
não bloqueantes (changeset sem bump do grupo e categoria duplicada em
CHANGELOG). Nenhum PR de preparação RC foi aberto.

O check local `devai check --only forbidden-actions --strict --since-ref
e09bd6c0` falhou com quatro achados: três `FORBID-PUBLISH` por texto
literal em commits Architect de contrato `19730677`, `9ad74570` e
`0106a12e`, sem execução de publicação; um
`FORBID-MUTATE-INVARIANTS` no commit Auditor `07b3cb47` da evidência
DEVAI exigida para o merge. A autoridade por SHA exato permanece
pendente antes do PR/merge, além do recibo separado para publicar.

Nenhum pacote foi publicado e nenhum recibo de publicação foi recebido.

O Owner autorizou em 2026-09-26 as ações necessárias ao encerramento
da campanha após o relatório que identificou explicitamente os quatro
SHAs DEVAI e os terceiros ciclos de review. O maestro vincula esta
decisão aos quatro recibos exatos e aos dois prompt-reviews excepcionais.
O recibo de publicação continuará separado, com comando e SHA finais.
O terceiro prompt-review excepcional da rota de publicação retornou
**PASS**. Os ajustes não bloqueantes foram vinculados aos sensores,
ao campo `preflight_latest_version`, ao canário
`@stynx-nyx/angular` e à regra de não enviar o commit intermediário
com digest ainda não rebindado.

A rota RC1 foi implementada em `d3021993`, com os 44 pacotes na
candidata `1.5.0-rc.1`, dist-tag `rc`, preflight completo e parada na
primeira ambiguidade. O sensor Inspector e trace foram ajustados em
`e9fc0a8b`/`c3072867`. O Owner vinculou em `3b20783a` os dois novos
achados por texto de publicação em `fc79c3f5` e `d3021993`; DEVAI
strict desde `e09bd6c0` passou sem findings. O CI integral passou no
HEAD anterior à reparação da revisão, com log
`/private/tmp/stynx-s15-rc1-final-ci.log`; release policy,
provenance, consumer fixtures e monotonicidade autenticada dos 44
pacotes passaram. Nenhum pacote foi publicado.

Delivery-review Opus da rota RC1 ciclo 1: **REVIEW** em
`reviews/rc1-publish-delivery-review-1.json`. Faltavam sensores
diretos de preflight, canário e releituras; o review também corrigiu a
afirmação sobre a última tag estável. Inspector ampliou os testes em
`e499dc7b` (42/42 focados); Engineer ligou as constantes e os recibos
duráveis em `48629e1f`; Architect rebindou trace e plano em
`a3694267`. O resolver autenticado escolheu a tag estável publicada
`v1.3.1` (`a46ecb88bf5796a8fa4d142c2daf8b52c25a549f`), e
DEVAI strict desde esse SHA passou sem findings. Segundo
delivery-review pendente de CI integral no HEAD reparado.

O CI integral do RC1 reparado passou (exit 0) no log
`/private/tmp/stynx-s15-rc1-review2-ci.log`. O delivery-review Opus da
rota RC1 ciclo 2 retornou **PASS** em
`reviews/rc1-publish-delivery-review-2.json`, com três sugestões
opcionais de sensores/recibo e sem bloqueio. O escopo aprovado inclui
preflight de 44 dist-tags, canário angular, proteção de `latest`,
releituras limitadas e recibo de parada com status do comando. PR de
preparação e recibo específico de publicação ainda pendentes.

## Integração de main na preparação RC1 (2026-09-26/27)

O Owner declarou nesta sessão: “Autorização concedida para qualquer ação
necessária para o correto e completo encerramento dessa campanha”. Sob
essa autorização, o maestro integrou `origin/main` `78a0f4ba` na branch do
PR #276 pelo merge `3383be943ca960e6df7a80480e3bdec4cc4769f9`. O
main já continha a adoção aceita de DEVAI 1.6.0 (ADR-DEVAI-ADOPTION-0004/0005)
e o workflow local de verificação RC em `17d87afaf386d68b75c67c458d519c0ef2e14274`.
O workflow foi incorporado com bytes idênticos aos do main; a rota STYNX
`release.yml` não mudou. Nenhum pacote foi publicado.

O check DEVAI strict desde a última tag estável publicada `v1.3.1`
(`a46ecb88bf5796a8fa4d142c2daf8b52c25a549f`) apontou quatro
ocorrências no merge `3383be94`: `FORBID-RM-RF`,
`FORBID-CI-WITHOUT-ADR`, `FORBID-PUBLISH` e
`FORBID-MUTATE-INVARIANTS`; e duas no commit upstream `17d87afa`:
`FORBID-RM-RF` e `FORBID-CI-WITHOUT-ADR`. O Owner vinculou sua
autorização a esses seis pares exatos por recibos em
`law/policy/forbidden-action-authorizations.json`. A checagem repetida
no SHA `84743f8578bc42ee9fe75cf604c38da01bf03b32` retornou zero
findings, com 14 recibos aplicados. Os recibos de
`FORBID-PUBLISH` cobrem apenas texto de comando em commits; a publicação
de `1.5.0-rc.1` exige recibo separado com comando e SHA candidato finais.

O Architect restaurou sete recibos R-0002 perdidos pela resolução do
conflito de política e regenerou o SBOM (169 componentes). O Inspector
rebindou três hashes do manifesto raiz no contrato local RC; a suíte
correta `node --test` passou 66/66. Trace permaneceu 393/393.
`release:policy`, `release:provenance` e `release:consumer-fixtures`
passaram, incluindo 44 tarballs em três fixtures. A revisão Opus do
delta de main, ciclo 1, retornou REVIEW unicamente por CI ainda ativo;
seu veredito está em `reviews/rc1-main-integration-delivery-review.json`.
O CI completo deste HEAD usa o log
`/private/tmp/stynx-s15-rc1-postmain-ci.log`; concluiu com exit 0 no
SHA `84743f8578bc42ee9fe75cf604c38da01bf03b32`, incluindo
`test:int`, build e doctor/RLS. Depois do merge, rodar DEVAI strict sobre o SHA mesclado e
vincular eventuais ocorrências exatas do merge antes do dispatch de
`release.yml`.

O segundo delivery-review Opus do delta de main retornou **FAIL** em
`reviews/rc1-main-integration-delivery-review-2.json`, ainda local e não
commitado. A prova de CI foi aceita, porém o commit de evidência
`c4b926b76f6716b82f0e2d68f1a3210d78acb692` introduziu duas
ocorrências de texto de comandos citados pela revisão anterior, sem
recibos vinculados: `FORBID-RM-RF` e `FORBID-PUBLISH`. Portanto o check
DEVAI strict voltou a falhar no HEAD posterior a `c4b926b7`. A regra
da rodada manda parar após FAIL escalado. PR #276 não foi atualizado nem
mesclado; nenhum pacote foi publicado. A retomada deve vincular recibos
Owner para os dois pares exatos, confirmar zero achados no SHA reparado
e solicitar novo review antes do push.

A retomada autorizada pelo Owner vinculou os dois recibos de evidência
do commit `c4b926b76f6716b82f0e2d68f1a3210d78acb692` em
`7eee34de599a137b7d896669f0007442a106feb0`. DEVAI strict desde
`a46ecb88bf5796a8fa4d142c2daf8b52c25a549f` passou nesse SHA
com zero findings e 16 recibos aplicados (log
`/private/tmp/stynx-s15-rc1-resume-forbidden.log`). O terceiro
delivery-review Opus do delta de main retornou **PASS** em
`reviews/rc1-main-integration-delivery-review-3.json`; confirmou a
correção e a validade do CI integral de `84743f85`. Os JSONs originais
dos ciclos 2 e 3 são preservados integralmente como evidência.

## Reparo do gate release-drafts do PR #276

O check remoto `release-drafts` falhou no primeiro push de #276: o
Changesets tratou o candidato RC já versionado como 44 mudanças sem
changeset pendente. O Architect fixou no plano a classificação estreita
para pre mode versionado; Inspector registrou negativos antes da
implementação; Engineer corrigiu `run-release-preparation.mjs` e
`release-context.mjs`; Architect rebindou trace. A revisão Opus ciclo 1
retornou PASS com recomendações para RCs futuras; estas foram
implementadas em commits separados por papel. O ciclo 2 retornou PASS
em `reviews/rc1-release-status-delivery-review-2.json`. Os 43 testes
focados passaram; `pnpm release:status` e `pnpm release:drafts` passaram
com zero drafts pendentes. O CI integral no SHA
`c8435e1fc5cea085de5f1f08127e1f274ebf689e` concluiu com exit 0
(log `/private/tmp/stynx-s15-rc1-release-status-final-ci.log`), incluindo
RLS e doctor. `release:policy`, `release:provenance` e DEVAI strict
desde `a46ecb88` passaram. `release:consumer-fixtures` falhou em uma
instalação temporária TEAT e passou na repetição, com 44 tarballs e
três fixtures (log `/private/tmp/stynx-s15-rc1-consumer-fixtures-retry.log`).
Nenhum pacote foi publicado.

## CTG-0007 — checkpoint de prompt-review, ciclo 2

Opus 5.5 retornou `REVIEW` em `reviews/ctg7-prompt-review-2.json`: o bloqueio
foi a passagem HMAC→tenancy incompatível com o `TenantContextInterceptor`
real, que ignora `request.tenantId` na seleção e prioriza bearer decodificado
sem assinatura sobre `principal` para ator. O Architect fixou o canal
`onVerified` → `request.stynxClaims.{sub,tenantId}` após HMAC/replay, limpeza
de identidade na entrada, conflito header/claim 403, negativos de bearer
forjado e os caminhos `OPTIONAL_TENANCY_PATHS` excluídos. Também fechou
formato/header de timestamp e assinatura, validação de `businessDays` e
o desvio Angular de propriedades omitidas/ordem Unicode versus DETRAN.
Contrato e prompts 80–82 foram atualizados; prompt 86 prepara o ciclo 3
excepcional. O limite de dois `REVIEW` foi atingido. A exceção Owner para
executar prompt 86 está pendente; nenhum terceiro review ou worker foi
despachado. Nenhum código F2, teste F3 ou DETRAN foi editado neste reparo.

## CTG5 — correção de conformidade do envelope antes do Inspector (2026-09-28)

A reavaliação de `INV-ERROR-001.change_policy` e da especificação
UPS-TXN-03 concluiu que a opção A corrige somente código CTG5 não publicado
para o schema de erro vigente; não muda `law/` nem os corpos legados. Os tags
`@stynx-nyx/backend@1.5.0-rc.1` e `rc.2` não contêm
`packages/backend/src/transactional-command/**`; `rc.3` não foi publicado.
O Owner autorizou a campanha, mas não é atribuído a ele uma escolha A/B ou
uma exceção. O Opus retornou PASS de classificação no fallback estruturado
`reviews/ctg5-error-authority-classification-review-1.json`; a ponte DETRAN
rejeitou sua resposta cercada por Markdown. O recibo registra digests do
mesmo prompt e da saída válida.

O contrato, o catálogo `errors.json` com 21 códigos da nova fronteira e
os corpos legados 504/503/500/422, a nota de migração, o plano e os prompts
105/106 foram emendados pelo Architect em `29dfa65f`. `pnpm api:contract`
passou (135 paths) e `pnpm check:trace --print` passou (449/449) antes dos
testes novos. O prompt-review de workers ciclo 3 retornou REVIEW por apontar
o PASS antigo e omissões de catalogação; o reparo Architect está em
`921d358a`. O ciclo 4 retornou **PASS** em
`reviews/ctg5-envelope-worker-prompt-review-4.json`, com recibo da ponte
e SHA-256 dos dois prompts vinculados em
`reviews/ctg5-envelope-worker-review-binding.json`, commit `379e933c`.
O PASS anterior review-2 fica superado. Verificar o binding e o HEAD exato
informado pelo maestro antes do despacho Inspector. Nenhum teste ou código
foi alterado nesta etapa; próximos commits: Inspector vermelho → Architect
trace → Engineer verde → Architect baseline → delivery-review → importação
cumulativa, sem CI completo/PR/RC intermediário sob OD-S15-02.

## CTG5 — sensores e rebind de trace (2026-09-28)

O Inspector worker entregou sensores parciais em duas tentativas; a triagem
`reference-gap` e a escalada ao maestro constam em `plan.md` §Triagem. O
maestro concluiu os testes no papel Inspector e os commitou em
`380f302f2da0a3996f814d33dfc6597ac4730e57`. A prova focal de 11 arquivos
contra PostgreSQL real foi vermelha como esperado: 46 falhas de contrato e
47 testes verdes, incluindo rollback, RLS e as respostas legadas. O comando
usou `STYNX_TEST_PG_HOST=127.0.0.1`, porta `55432`, usuário/senha
`postgres`, e `pnpm --filter @stynx-nyx/backend test --` com os arquivos
`transactional-command-*`, `angular-transactional-command-http` e
`if-match-http`; log efêmero
`/private/tmp/stynx-ctg5-inspector-complete-red.log`. `pnpm lint:tests`
passou. Os casos esperados falham por corpos CTG5 antigos, rejeições de
bootstrap ausentes e falhas de dependência expostas como 500. O worker
executou indevidamente uma leitura `git show` sem mutação no início da
primeira tentativa; depois não executou Git. Só o maestro fez os commits.
O Architect rebinda `law/trace.json` a 451/451 testes rastreados neste
checkpoint em `45a46c07fe921b47c7f36929fc885684740b5e43`; não alterou
schema nem invariante de erro. Para o despacho Engineer, os SHAs vinculantes
são: contrato Architect `29dfa65f`, binding PASS de prompts `379e933c`,
sensores Inspector `380f302f2da0a3996f814d33dfc6597ac4730e57` e rebind
Architect `45a46c07fe921b47c7f36929fc885684740b5e43`. O HEAD de
checkpoint antes do despacho é o commit Architect que registra estes SHAs.
