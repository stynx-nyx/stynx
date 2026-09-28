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

## Retomada consolidada sob OD-S15-02 (2026-09-28)

Os parágrafos históricos acima registram o estado de suas respectivas datas;
seus itens pendentes foram superados pelos checkpoints posteriores em
`plan.md` §Retomada. A OD-S15-02 substituiu PR, RC e CI integral por CTG para
as CTGs 5–8 por uma importação cumulativa 5 → 6 → 7 → 8, com gates focais e
delivery-review por grupo, seguida de um único gate final. CTG7 teve PASS
integrado em `22d976fb`; CTG8 teve PASS integrado em `0c7eb2e0`. O código
cumulativo, incluindo o hardening da CTG8, está em `81681892`. A branch
`feat/release-1-5-0-jobs` está em `6628b5ca` após checkpoints documentais.
Nenhum PR final foi aberto e não houve RC nova sob a OD-S15-02. RC1 e RC2
publicadas anteriormente continuam evidência histórica, não declaração final.

A comparação read-only da adenda DETRAN A1 §8.1 mostrou que SIG/OBX/OFS
totalizam dez IDs MUST ainda sem implementação STYNX. A prévia condicional
`ctg-0009-preflight.md` foi registrada em `6628b5ca`, sem despachar workers
nem alterar produto. A decisão do Owner sobre incluir esses IDs na 1.5.0 ou
adiá-los expressamente continua pendente. O conflito do novo HTTP 409 CTG5
com `law/schemas/error-envelope.schema.json` foi corrigido em tríade isolada
pela opção A Architect, sem mudança de `law/` ou de fio publicado. O Opus
confirmou a classificação, aprovou os prompts Inspector/Engineer e deu PASS
no delivery-review da correção. Este merge importa o delta na branch
cumulativa. A decisão Owner de escopo A1 §8.1 segue pendente; a correção de
conformidade CTG5 não é apresentada como escolha Owner A/B.

Preflight do gate final, sem escrita de versão: `pnpm release:preview` passou
na branch cumulativa e listou cinco changesets pendentes (jobs, transação,
web-kit, utilitários e CLI). Como `.changeset/pre.json` ainda está no modo
`rc` e os manifests estão em `1.5.0-rc.3`, a prévia reportou
`1.5.0-rc.3 -> 1.5.0-rc.4`; isso **não** é a versão final pretendida. A
sequência final continua `pnpm changeset pre exit` e
`pnpm version-packages` depois do congelamento do escopo e da correção
autorizada. `git fetch -q origin --prune` confirmou `origin/main` e `main`
em `493fcd959592d30055dcacabd57e4cc19505f2c6`, ancestral do HEAD
cumulativo; o único PR aberto observado foi o bot Changesets #273. O único
CI local integral, PR, CI remoto, merge e publicação final permanecem
pendentes.

## Prévia condicional CTG9 — revisão técnica (2026-09-28)

O reviewer Opus 5.5 leu a adenda A1 e o código STYNX sem mutação. Ciclo 1:
`REVIEW` em `reviews/ctg9-conditional-contract-review-1.json`, com sete
achados bloqueantes sobre autoridade Owner, ordenação/ledger outbox,
canonicalização e confiança de assinatura, e unicidade offline. Ciclo 2:
`REVIEW` em `reviews/ctg9-conditional-contract-review-2.json`, após confirmar
os sete reparos; apontou perda de precisão `Date`/UUIDv4 e a corrida do cursor
inicial. A ponte rejeitou a resposta cercada por Markdown; o mesmo prompt
rodou por `claude -p --json-schema`, e o digest está no recibo `.bridge.json`.
Ciclo 3: `REVIEW` em `reviews/ctg9-conditional-contract-review-3.json`, com
os bloqueios restantes de sentinela `id=''`, réplica atrasada e ordem de locks
do applier. O Architect incorporou os reparos no `ctg-0009-preflight.md`:
tupla de milissegundo/UUIDv7 monotônico, leituras no primário, sentinela SQL
segura e transação independente por item, além dos negativos requeridos.
Esta prévia não é contrato aprovado nem prompt-review de workers. As decisões
Owner de escopo e de substituição das autoridades existentes seguem pendentes;
nenhum worker CTG9, código, DDL ou versão de pacote foi alterado.

Ciclo 4: `REVIEW` em `reviews/ctg9-conditional-contract-review-4.json`.
A ponte rejeitou texto cercado por Markdown com JSON malformado, então
`claude -p --json-schema` produziu o recibo estruturado com o mesmo prompt.
O achado de maior alcance foi confirmado no código: `Database.tx` sob CLS
ativo cria SAVEPOINT, e a CTG5 mantém uma transação externa durante o handler;
logo não havia independência por item. Também faltava incluir o lock da
cadeia de auditoria na ordem total antes do relógio outbox. A prévia agora
exige endpoint de lote fora de `@TransactionalCommand`, erro tipado se houver
transação ambiente, serialização de `audit.write` antes do relógio por
migração forward, sequência `CACHE 1 NO CYCLE` sem truncamento, migração de
IDs v4 para UUIDv7 com mapa, e checagens na conexão efetiva. Ainda não há
PASS condicional nem autorização de escopo; não houve alteração de produto.

Ciclo 5: `REVIEW` em `reviews/ctg9-conditional-contract-review-5.json`.
O reviewer confirmou que a prévia havia fechado migração UUIDv4→UUIDv7,
codificação da sequência e checks SQL, mas mostrou dois bloqueios restantes
no código real: `audit.fn_row_change` de 0017 não usa advisory lock, e os
wrappers de RequestContext podem apagar `TX_CONTEXT_KEY` do CLS. Também
apontou que `TxOptions.isolation` é ignorado no top-level, que o recibo de
lote pode ser escrito antes do check de transação, que `now()` precisa de
INSERT, e que deadlocks domínio×audit devem produzir resultado retentável.
A prévia condicional foi emendada com migração que redefine trigger e writers,
marca AsyncLocalStorage herdável de conexão detida, porta de append na mesma
`Transaction`, check antes de qualquer escrita, aplicação sequencial,
isolamento efetivo e grants/RLS do relógio. Continua sem decisão Owner,
prompt-review PASS ou implementação CTG9.

Ciclo 6: `REVIEW` em `reviews/ctg9-conditional-contract-review-6.json`.
O Opus aceitou que as obrigações do ciclo 5 estavam escritas, mas encontrou
três lacunas adicionais no código real: advisory sem posição monotônica não
lineariza a cabeça auditada hoje ordenada por `now()`/UUIDv4; falha fechada
global de `Database.tx` em contexto derivado quebraria caminhos legados de
i18n/ratelimit/tenancy dentro do envelope CTG5; e `now()` SSE não precisa
esperar o advisory da cadeia, o que poderia esgotar o pool sob transações
auditadas longas. Também pediu holder ALS mutável desativado no `finally` e
tratamento explícito da contenção da sentinela tenant NULL. O prompt-review
condicional continua sem PASS e nenhum worker CTG9 foi despachado. O maestro
aguarda a decisão Owner de escopo antes de nova revisão dessa prévia.

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

## CTG5 — implementação e rebind de API (2026-09-28)

O Engineer implementou a conformidade do envelope nos arquivos CTG5 e o
maestro commitou essa entrega como `62dfb56115a124ea92dbb69d64c71b659c4febaf`.
O ajuste mantém os corpos legados e os códigos do catálogo, e resolve o
`requestId` pela ordem do contrato antes de devolver rejeições CTG5.
Após a correção Inspector dos dois sensores e novo rebind Architect de trace,
os 11 arquivos focais passaram (93/93 testes), assim como toda a suíte
backend (499/499), lint, typecheck, RLS negativo e smoke, trace (451/451),
READMEs dos 44 pacotes e DEVAI strict sem findings. A execução de
`pnpm test:int` com PostgreSQL real passou (52/52 tarefas; log local
`/private/tmp/stynx-ctg5-envelope-test-int.log`).

O Architect executou `pnpm api:baselines:write` após confirmar que o único
delta público é o tipo da dependência opcional `RequestContext` no construtor
do filtro CTG5. O gerador mudou três digests da mesma declaração em
`docs/framework/contracts/public-api-baselines.json`; `pnpm api:baselines`
confirmou 44/44 pacotes. Este rebind e o registro compõem o próximo commit
Architect. Ainda faltam delivery-review PASS e importação cumulativa;
nenhum PR, RC ou CI integral foi iniciado nesta correção.

## CTG5 — delivery-review do envelope (2026-09-28)

O Opus 5.5, pela ponte DETRAN, revisou o patch desde `81681892` e retornou
**PASS** em `reviews/ctg5-envelope-delivery-review-1.json`, com recibo
`reviews/ctg5-envelope-delivery-review-1.bridge.json`. O prompt e a saída
têm os SHA-256 registrados no recibo e foram conferidos pelo maestro.
O reviewer não executou Git; o maestro verificou a sequência de autores:
commits de contrato, trace, baselines e reviews como DEVAI Architect;
sensores `380f302f` e `2ac1d54d` como DEVAI Inspector; implementação
`62dfb561` como DEVAI Engineer. O veredito autoriza a importação ordenada
sob OD-S15-02, sem PR/RC/CI integral intermediário.

Achado não bloqueante para a importação, mas exigido antes da final: quando
CTG5 converte falha interna em envelope público 500/503, preservar a causa
e registrar requestId e stack no log do servidor, sem mudar o corpo público;
adicionar sensor dessa invariância. Os demais achados são a ausência de prova
HTTP para dois ramos defensivos inalcançáveis via core, duplicação local do
regex de `errorCode` e observações de cobertura/autor. Não declarar a final
pronta até o reparo de observabilidade e review correspondente.

## CTG5 — follow-up de observabilidade (2026-09-28)

O delta CTG5 aprovado foi importado na branch cumulativa pelo merge
`b1195fe5d3226dfe6afc7b0c01b168ee8644c074`. No HEAD integrado,
`pnpm api:baselines` passou 44/44, trace 451/451, READMEs 44/0 e RLS
negativo 7 tabelas; a suíte backend passou 499/499. O Architect fixou o
contrato do follow-up em `b973d118`. O Inspector commitou os sensores em
`3e2a30a2`: três falharam pelo log ausente e 25 passaram, com PostgreSQL
real; `pnpm lint:tests` passou. O Architect rebinda o trace em `8e8a0794`,
novamente 451/451. O Engineer implementou o log e a causa em `a8723b75`;
uma segunda edição `a5fea2dd` evitou mudar a declaração pública exposta
pelo filtro. O código mantém a causa em `HttpException.cause` no servidor e
o filtro serializa apenas campos canônicos.

Os sensores focais passaram 28/28; o backend completo passou 501/501 em 48
arquivos, com lint e typecheck verdes. Um primeiro rerun completo falhou ao
carregar nove arquivos por `@stynx-nyx/integration-adapter` sem `dist` local;
o maestro gerou esse build ignorado pelo Git e repetiu a suíte no mesmo HEAD,
que passou (`/private/tmp/stynx-ctg5-observability-backend-final-retry.log`).
`pnpm api:baselines` passou 44/44 após build backend, trace 451/451,
READMEs 44/0 e RLS negativo 7 tabelas. Falta delivery-review Opus deste
follow-up antes de declarar o achado encerrado.

O Opus 5.5 retornou **PASS** no delivery-review do follow-up em
`reviews/ctg5-observability-delivery-review-1.json`, pela ponte DETRAN e
com recibo de digests. Identificou um caso limite para a final: a coerção
`String(cause)` no filtro pode lançar quando o valor original é um objeto
sem protótipo ou possui `toString` hostil; o envelope seria perdido. O
Architect adicionou uma rodada focal Inspector → Engineer para garantir que
nenhuma falha de formatação/log mude o fio público. O reviewer também
sugeriu sensores adicionais de `errorCode` no log e do caminho sem causa.

O Inspector adicionou o sensor HTTP de causa opaca em `77588011` e obteve
vermelho esperado: 1 falha por corpo vazio, 12 testes verdes; lint de testes
passou. O Architect rebinda o trace em `39ea92a7` (451/451). O Engineer
isolou a formatação e a chamada do logger em blocos que não escapam ao filtro
em `d6bd8138`. O sensor focal passou 13/13 e a suíte backend completa passou
502/502 em 48 arquivos; lint e typecheck backend e lint de testes passaram.
O corpo e o header públicos continuam verificados no mesmo sensor. Falta o
delivery-review independente deste último delta.

O Opus 5.5 retornou **PASS** do caso opaco em
`reviews/ctg5-opaque-delivery-review-1.json`, com recibo
`reviews/ctg5-opaque-delivery-review-1.bridge.json`. O reviewer confirmou
por leitura do código que nem a coerção da causa nem o logger podem escapar
para substituir o envelope; os 409, erros de data e respostas do consumidor
seguem fora desse caminho. Apontou como opcional um teste de transporte de
log que lança; a guarda no código foi inspecionada e não há achado
bloqueante. O maestro confirmou a autoria DEVAI Inspector em `77588011`,
Architect em `39ea92a7` e Engineer em `d6bd8138`.

## OD-S15-03 — CTG9 incluída na STYNX 1.5.0 (2026-09-28)

O Owner determinou: “inclua CTG9 e continue”. A decisão inclui
UPS-SIG-01…04, UPS-OBX-01…02 e UPS-OFS-01…04, os dez MUST da adenda A1 §8.1
do DETRAN, na publicação final da STYNX 1.5.0. O único gate consolidado
local CI/PR/CI remoto/publicação definido pela OD-S15-02 passa a ocorrer
depois da CTG9. Nenhum PR nem RC intermediária será aberta/publicada.
O prompt-review Opus do contrato e dos prompts dos workers continua obrigatório
antes do despacho; as três frentes podem avançar em paralelo em arquivos
sem lock comum, com a porta OBX fixada antes da integração OFS→OBX. O DETRAN
permanece somente leitura. Este registro substitui as menções históricas
a escopo CTG9 pendente; não afirma implementação, teste ou publicação.

O review técnico Opus 7 (`reviews/ctg9-contract-review-7.json`) retornou
REVIEW com quatro bloqueios concretos: snapshot RR da cabeça audit,
incompatibilidade da proposta com `AuditSqlSink` owner, legado já
bifurcado e nova conexão por efeito de domínio dentro do item OFS. A
revisão Architect do contrato limita escritores auditados a READ COMMITTED,
vincula cada transação a uma cadeia por GUC, classifica e sela legado sem
reescrever hash, e ativa modo transacional estrito só na API OFS. O próximo
prompt-review avaliará esse fechamento e os prompts Architect; ainda não
há PASS nem implementação CTG9.

O prompt-review Opus de fechamento 1
(`reviews/ctg9-prompt-review-closure-1.json`) retornou REVIEW. Confirmou o
fechamento contratual dos quatro bloqueios técnicos do review 7, mas
detectou que o prompt SIG concedia escrita em `packages/` a Architect e
criaria documento paralelo ao contrato `signature.md`. O prompt foi
restringido a docs/contrato de rodada/ADR, com reparos pontuais de OBX,
auditoria e migração; ainda não houve despacho.

O prompt-review focal 2 (`reviews/ctg9-architect-prompt-delta-review-2.json`)
retornou **PASS** para os três Architects em paralelo. Os write sets de
SIG, OBX e OFS são disjuntos e limitados a docs, ADRs e contratos de
rodada. Três observações editoriais não bloqueantes foram corrigidas antes
do despacho; o PASS não atesta produto, testes ou publicação.

O maestro despachou os Architects SIG, OBX e OFS em paralelo após o PASS,
com os prompts 137–139. OBX detém apenas os contratos data/audit/outbox;
OFS cita as portas e não as redefine. Git, índices ADR/contratos e gates
compartilhados permanecem sob lock exclusivo do maestro.

Os três Architects concluíram seus write sets, sem Git ou alterações no
DETRAN. SIG entregou contrato de nível, trust verifier, readiness, manifesto
e retirada, com ADR de confiança ainda proposta. OBX entregou contrato de
event log, auditoria/épocas, transação independente, SSE e ledger, com ADR
superadora; OFS entregou numeração, lote/recibo, applier por item e
concorrência/handoff, com ADR superadora. O maestro fez o índice de ADRs
aceitas OBX/OFS e iniciou delivery-review independente; os documentos são
contratos, não prova de implementação.

O primeiro delivery-review dos contratos retornou **REVIEW** em
`reviews/ctg9-architect-delivery-review-1.json`. A ponte DETRAN invocou
Opus 5.5, mas rejeitou a resposta cercada em Markdown por formato; o
maestro repetiu o mesmo prompt com `claude -p` e schema estruturado,
registrando a falha da ponte em `reviews/ctg9-architect-delivery-review-1.bridge-failure.md`.
Três bloqueios: corte OBX entre claim/ACK legados e projeção nova sem
autoridade única; SIG sem implementação criptográfica de confiança no STYNX;
OFS sem precedência fixa entre recibo do lote e `Idempotency-Key`. Os
Architects receberam reparos em paralelo, incluindo observações menores.
O resultado não libera Inspectors nem confirma conformidade.

O delta Architect foi commitado em `d3347c43` com somente documentos e
prompts; `git diff --check` e Prettier passaram. O delivery-review Opus 5.5
pela ponte DETRAN retornou **REVIEW** no ciclo 2 em
`reviews/ctg9-architect-delta-delivery-review-2.json`: os três bloqueios
anteriores foram fechados, mas uma sequência append→enqueue concorrente
com cutover OBX ainda permite deadlock por ordem marker/advisory/clock.
O reviewer também pediu espelhar falha de dispatch pós-corte, liberar claim
de eventos nativos sem corte, preservar headers de replay e resultado de
lote em progresso, reaproveitar recibo legado idempotente e exigir
reconhecimento explícito para verificador customizado em produção. Cada
Architect recebeu a observação do seu pacote; nenhum Inspector foi despachado.

O delta de ordem de locks foi commitado pelo Architect em `1df59635`. O
delivery-review Opus 5.5 ciclo 3, pela ponte DETRAN, retornou **PASS** em
`reviews/ctg9-architect-lock-delta-review-3.json`: contratos aptos ao
prompt-review Inspector, sem atestar implementação. Quatro observações
OBX não bloqueantes foram devolvidas ao Architect antes dos sensores:
rejeitar corte em tabelas com trigger audit ativado pelo adotante, retry
isolado de falha de dispatch, ordem de `now()` ambiente e corrida de
três participantes no marker. Nenhum Inspector foi despachado ainda.

O prompt-review Inspector ciclo 1 retornou **REVIEW** em
`reviews/ctg9-inspector-prompt-review-1.json`. Dois bloqueios de
viabilidade: os sensores de composição CTG5/owner audit estavam confinados
a outbox/data, e PKI/health de SIG não resolviam no ambiente de testes.
O Engineer fez um commit separado `c21ba672`, instalando `pkijs`,
`asn1js`, `@peculiar/x509` e health em signature, gerando README/lockfile
e adicionando aliases de fontes para SIG, OBX/audit/backend e OFS int.
Verificações: signature 22/22, typecheck signature, `lint:deps` e
`lint:cycles` verdes. O Architect ampliou os prompts e negativos, sem
despachar Inspector até o prompt-review focal PASS.

O prompt-review Inspector ciclo 2 retornou **REVIEW** em
`reviews/ctg9-inspector-prompt-review-2.json`. Os bloqueios de import
foram fechados; restou um oráculo impossível de 55P03 quando UPDATE está
apenas enfileirado atrás de SHARE. O Architect corrigiu contrato OBX e
sensor com variante separada de UPDATE já detido. O prompt OFS agora exige
cancelamento e leitura de recibos, e explicita onde rodam os sensores
backend/audit. Em commit Engineer separado `c67774f9`, health passou a
`workspace:*` e foi criado changeset para as dependências signature.
Terceiro prompt-review focal autorizado pela OD ampla do Owner está pendente.

A ponte DETRAN executou o prompt-review Inspector focal 3, mas saiu 4 ao
receber uma frase de status antes do JSON. O motivo está em
`reviews/ctg9-inspector-prompt-review-3.bridge-failure.md`. O maestro
reexecutou `claude -p` com o mesmo prompt, Opus 5.5, modo plan e schema
estruturado: **PASS** em `reviews/ctg9-inspector-prompt-review-3.json`.
Uma observação editorial não bloqueante sobre o ramo 55P03 da fila A/B/C
foi fechada no contrato e prompt OBX. O PASS libera somente testes Inspector,
sem afirmar código ou conformidade CTG9.

Os Inspectors SIG, OBX/data e OFS foram despachados em paralelo após o PASS,
com write sets exclusivos e sem Git. SIG montou fixture PKI real
CMS/PAdES/TSA/OCSP/CRL; OBX obteve vermelhos PostgreSQL comportamentais
de marker e audit; OFS obteve vermelhos de numeração/lote/HTTP/migration.
OFS encontrou conflito entre sensores E6 publicados (dedup por hash em
outra chave, segundo cancelamento 409) e a paridade da adenda A1. O
Architect fixou modo CTG9 por `OfflineSyncPolicyResolver` no bootstrap,
preservando E6 sem resolver e seus testes intactos. Contrato, ADR e prompts
foram ajustados; review focal Opus está pendente antes de Engineer.

Review Opus focal ciclo 1 `reviews/ctg9-ofs-mode-contract-review-1.json`
foi REVIEW, com três bloqueios: E6 na migration 0002, `OfflineSyncStore`
exigindo métodos novos e ausência de sensores para os dois bootstraps.
O Architect fixou índice parcial E6 com `identity_mode` server-owned,
interface `OfflineSyncDurableStore` separada, tipos CTG9 separados e
validação de portas no bootstrap. Os sensores Inspector foram ampliados
para E6 sobre 0002, metadata HTTP em ambos os modos, identidade legada
entre lotes e ponte de `IdempotencyStore` somente leitura. Review delta
Opus ciclo 2 está pendente; nada aqui atesta código CTG9 implementado.

Review focal ciclo 2: a ponte falhou ao formatar o JSON cercado de Markdown
e prosa; `reviews/ctg9-ofs-mode-delta-review-2.bridge-failure.md` documenta
o fallback `claude -p` estruturado, que retornou REVIEW. O review detectou
ordem de migration na própria suíte e INSERT CTG9 sem coluna de modo; o
Architect fixou 0002 como pré-requisito para ambos os modos e a coluna
física `identity_mode`, enquanto o Inspector atualiza somente setup E6 e
sensores novos. Um novo review após congelar a árvore é obrigatório.

Review focal ciclo 3: a ponte retornou JSON cercado de Markdown e prosa
e saiu 4; fallback `claude -p` estruturado registrou REVIEW em
`reviews/ctg9-ofs-mode-final-review-3.json`. Três sensores ainda não
podiam provar implementação correta: 422 com sequência de lote já
ocupada, ausência de escrita CTG9 pelo store real com leitura E6
filtrada, e ausência de rollback PostgreSQL por item. O Inspector recebeu
nova tentativa. Nenhum Engineer OFS foi despachado.

Os sensores Inspector SIG e OBX/data/backend/audit foram commitados em
`314d6ba6`, em commit de testes isolado. O hook ESLint e Prettier passou;
`.gitattributes` marca PDFs PKI de teste como binários para preservar os
bytes assinados. SIG tinha 121 vermelhos esperados e 10 verdes, com E6
legado 11/11 verde. OBX tinha 19 vermelhos esperados e dois verdes no
PostgreSQL local. Prompt-review 158 solicita despacho antecipado apenas
dos Engineers SIG e OBX; OFS e rebind trace seguem pendentes.

Opus `prompt-review` focal dos Engineers SIG/OBX retornou **PASS** em
`reviews/ctg9-sig-obx-engineer-prompt-review-1.json`, com três notas não
bloqueantes incorporadas aos prompts 151/152. O PASS libera somente os
dois write sets de produção em paralelo, não código OFS nem conformidade.

Os Engineers SIG e OBX/data foram despachados em paralelo após o PASS.
O Inspector OFS corrigiu os três bloqueios do ciclo 3; prompt 159 pede
review do delta antes de seu commit Inspector e do despacho Engineer OFS.

Review do prompt 159: a ponte rejeitou JSON cercado e texto com aparente
PASS; o fallback estruturado retornou **REVIEW** em
`reviews/ctg9-ofs-sensor-delta-review-4.json`, por sensor PostgreSQL
conectado como superuser. O veredito estruturado governa a rodada; o
Inspector deve usar `stynx_app`/`stynx_reader` reais e verificar FORCE RLS
antes de novo review. O prompt Engineer 153 ganhou oráculos explícitos
de recibo, partial, 40P01 e papel app.

O Inspector corrigiu a única falha bloqueante do review 4: conexões
`stynx_app`/`stynx_reader` reais, ambas sem superuser/BYPASSRLS; o
preflight passou no PostgreSQL antes do erro esperado de 0002 ausente.
O 40P01 agora é levantado pelo SQL da transação. Após três saídas da
ponte rejeitadas pelo mesmo formato, o ciclo 5 usa diretamente
`claude -p` com o prompt 160 e JSON estruturado. O veredito está pendente.

Durante a implementação SIG, o Engineer apontou dois oráculos impossíveis
nos sensores: fase do hook Nest em `compile()` e `verifiedAt` local em vez
de tempo TSA assinado. Triagem `sensor-error`; Inspector SIG corrige os
testes, sem mover a validação de produção para depois do bootstrap nem
fabricar o instante criptográfico.

Review OFS ciclo 5 retornou **PASS** em
`reviews/ctg9-ofs-app-role-review-5.json`. Uma nota opcional recomenda
executar também o sensor 0001-only sob `stynx_app`; o maestro aplicará
antes do commit Inspector. O PASS libera o commit dos sensores OFS e o
prompt-review Engineer integrado, sem atestar implementação. Inspector
SIG corrigiu os dois oráculos, com três arquivos/70 testes focais verdes.
Engineer OBX apontou cinco oráculos de SQL exato no legado incompatíveis
com marker de posse; Inspector OBX corrige preservando a semântica.
