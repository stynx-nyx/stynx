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

Nenhum pacote foi publicado e nenhum recibo de publicação foi recebido.
