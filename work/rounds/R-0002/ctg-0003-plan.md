# CTG-0003 — autorização e sessão

**Papel:** Architect. **Base de preparação histórica:** CTG-0002 `20f10f53`,
PR #278 depois encerrado. O CTG-0002 foi integrado pelo PR #285 no SHA
`ce6521438584db70f67e62f48d95048acd88be8b`; este branch foi
reaplicado sobre esse SHA antes da entrega. **Fonte:** DETRAN C-0002 rev.2 §4, §7 e §8,
HEAD somente leitura `220a40202bf4ab17a5ce28b882ad96d60755842f`.
OD-S15-01 torna UPS-AUTHZ-01…07 e UPS-SES-01…03 todos MUST.

## Leitura e contrato

O Architect confirmou o contrato em
`docs/framework/contracts/authorization-session-1.5.md` contra o
código atual. `StynxAuthorizationModule.forRoot` hoje só aceita
`policyEvaluator`; o guard não é global e retorna imediatamente sem
`STYNX_AUTHZ_METADATA`. O avaliador padrão e o Angular usam match
exato. `PolicyEvaluationContext` não tem tenant. O token do avaliador
existe, mas o módulo só o vincula quando recebe um custom evaluator.

`SessionService.create` grava diretamente no store; `exchange` revoga
e cria. Os stores têm índices por usuário e tenant, mas não operação
atômica de política por usuário+tenant. `AuthService` valida token
Cognito, mas não transmite `amr`/`acr` validados ao serviço de sessão;
`deviceMeta` vem do cliente. O health aceita indicadores estruturais.
O contrato fixa default compatível, política opt-in, fonte confiável
de tenant e prova de concorrência real no Redis.

## Tarefas e locks

1. Prompt-review Opus 5.5 do plano, contrato e prompts abaixo antes
   de despachar qualquer tarefa de escrita. REVIEW admite dois ciclos;
   FAIL escala. Reviewer é da outra família via ponte DETRAN, sem
   escrever no repositório DETRAN.
2. Inspector A: backend/contracts/Angular auth, testes de
   UPS-AUTHZ-01…07, com presença **e** ausência. Lock em
   `packages/backend/test`, `packages/contracts/test` e
   `packages-web/angular-auth/test`; não tocar sessions/auth nem
   arquivos governados.
3. Inspector B: `packages/sessions/test` e `packages/auth/test`, prova
   dos modos, concorrência Redis, fator validado e prontidão. Não
   tocar os caminhos do Inspector A. A composição health fica em
   `reference/api/test/integration/session-readiness.integration.spec.ts`,
   usando o manifesto existente; o Inspector B detém esse arquivo.
   Testes devem falhar no produto atual pelos motivos esperados,
   sem enfraquecer testes existentes.
4. Engineer A implementa autorização no backend/contracts/Angular após
   os sensores A; Engineer B implementa sessões/auth após sensores B.
   Ambos seguem o contrato, sem shim e sem código do DETRAN.
   Workers não executam Git; somente o maestro commita em papéis
   separados. Até duas tarefas sem lock comum rodam em paralelo.
5. Maestro Architect rebinda `law/trace.json` após testes via
   `pnpm check:trace --print`; após API estável, executa
   `pnpm api:baselines:write` e confirma o diff, em commits Architect.
   Maestro Engineer cria changeset minor do grupo fixo e roda
   `pnpm package-readmes:write`/check. Generated tooling só por gerador.
   A reference API permanece nos defaults de autorização/sessão; seu
   CI prova compatibilidade, enquanto o sensor de composição opt-in
   fica no arquivo de integração acima.
6. Maestro Architect preenche as linhas UPS-AUTHZ-01…07 e
   UPS-SES-01…03 da tabela de conformidade §7 com versão publicada,
   símbolos reais, testes e desvios, incluindo a semântica exata do
   guard separado de `@stynx-nyx/auth`.

## Gates

- Testes focados e negativos de autorização, sessão e Redis real.
- `pnpm check:rls-negative` e `pnpm test:int` para os caminhos de banco;
  `pnpm ci:reference-apps` para consumidor.
- `pnpm check:trace --print`, `pnpm api:baselines`,
  `pnpm package-readmes:check`, `pnpm ci:stynx` verde.
- DEVAI forbidden actions strict; delivery-review Opus PASS antes do
  PR único CTG-0003; CI remoto verde antes de merge. Registrar
  evidência DEVAI e audit observe no merge.

## Retomada

No replay sobre o CTG-0002, `pnpm ci:stynx` e `pnpm ci:reference-apps`
passaram no head `48065ba6` (logs
`/private/tmp/stynx-s15-ctg3-48065ba6-{ci,reference}.log`). O Inspector
acrescentou a prova E2E da precedência do avaliador local em `474faa71`
(15/15 focados); o Engineer corrigiu a mensagem de migração do store em
`fe12c299` (bootstrap 4/4, lint e typecheck); o Architect rebinda o novo
sensor em `9ad2ff98` (`pnpm check:trace --print`: 414/414). Antes do PR,
reaplicar este branch sobre o merge da RC2, executar gates completos e
obter novo delivery-review Opus no head integrado.

Replay pós-CTG-0002 em 2026-09-27: os 37 commits exclusivos da CTG-0003
foram reaplicados sobre `ce652143`; quatro commits históricos somente de
`law/trace.json` foram omitidos porque conflitavam com os sensores SSE já
integrados. O Architect refez o vínculo sobre o estado final: 414/414 testes
executáveis, com 9 entradas novas e 5 digests atualizados; baselines API
44/44, READMEs 44/44 e `release:policy` passaram. O delivery-review do
branch empilhado permanece histórico; executar gates e review pós-integração
no novo head antes de abrir e mesclar o PR CTG-0003.

O Opus delivery-review ciclo 3 retornou `PASS` em
`reviews/ctg3-delivery-review-3.json`, com quatro apontamentos não
bloqueantes. O Inspector atuou em `fa659bde` e o Engineer em
`f7ca3bb4`; o E2E sem módulo foi executado vermelho antes do reparo,
falhando com `UnknownElementException` em `app.init()`. A prova verde
está nos logs de CI e de consumidor citados abaixo. Este PASS vale para
a branch empilhada; revisão pós-integração CTG-0002, PR, CI remoto e
merge ainda faltam.

Após o delivery-review ciclo 2, o Inspector fixou o E2E de guard local sem
importar o módulo, a exclusão de SID expirado no Redis e a mensagem de boot
em `fa659bde`; o Architect rebinda `law/trace.json` 407/407 em
`f8f3ae5f`; o Engineer corrigiu o fallback de `ModuleRef.get` e a mensagem
em `f7ca3bb4`. `pnpm ci:stynx` passou integralmente (exit 0) no log
`/private/tmp/stynx-s15-ctg3-ci-delivery3.log`, assim como
`pnpm ci:reference-apps` (exit 0) em
`/private/tmp/stynx-s15-ctg3-consumer-delivery3.log`. DEVAI forbidden
strict desde `20f10f53` não encontrou ações. O prompt 52 solicita o
delivery-review ciclo 3; ainda faltam PASS, integração pós CTG-0002,
PR e merge.

Contrato e prompts aprovados por Opus no ciclo 2 na worktree isolada
`/Users/aarusso/.codex/worktrees/ctg3-authz-session/stynx`. Inspectors
fixaram 11 sensores no commit `972592b0`; o rebind inicial da trace
foi `1ab1315b`. O Engineer de autorização entregou `dd7f1e15`, com
backend focado 84/84, Angular 59/59 e contracts 15/15. O Engineer de
sessão concluiu a implementação em `50bfa165`; o changeset está em
`6b45f0f0`. Correções de sensores estão em `02089520`, `ee60a6ac` e
`9602d114`; a trace 407/407 foi rebinda em `5308edf3`. O primeiro CI
integral apontou asserções de mera existência, e o segundo detectou um
ciclo de importação do guard. O Engineer eliminou o ciclo em `c964a520`
e o Architect rebinda as declarações públicas em `507f57f8`. O gate
`ci:reference-apps` passou; o terceiro `ci:stynx` passou integralmente
com exit 0 no log `/private/tmp/stynx-s15-ctg3-ci-cycle-retry.log`.
Faltam delivery-review, PR e sincronizar a base após o merge CTG-0002.
RC1 e RC2 continuam sujeitos a recibos Owner por versão, comando e
SHA exato antes de qualquer publicação.

Após o REVIEW do delivery cycle 1, os Inspectors acrescentaram sensores
de tenant forjado, `forRoot({global:true})`, switch Redis real e store
customizado em `96ad72b6`, `66881300` e `ab6b5af3`. O Architect
rebinda a trace 407/407 em `06599b88`. Os Engineers corrigiram a
autorização em `1bbdfbbd` e sessão/fator em `19d38031`; o Architect
rebinda API 44/44 em `2b3787e3`. A documentação de migração e o
changeset foram corrigidos em `9da63f09`. No HEAD `b3502c4b`,
`pnpm ci:stynx` passou integralmente com exit 0 no log
`/private/tmp/stynx-s15-ctg3-ci-delivery2.log`;
`pnpm ci:reference-apps` passou com exit 0 no log
`/private/tmp/stynx-s15-ctg3-consumer-delivery2.log`; e
`devai check --only forbidden-actions --strict --since-ref 20f10f53`
passou sem findings. O prompt do segundo delivery-review é
`prompts/49-ctg3-delivery-review-2.md`. Faltam seu veredito, integração
do CTG-0002 já mesclado, post-integration review e PR.

## Triagem

- CI pós-replay CTG-0003 em `8ecf3df4`: `reference-gap` — o checkout ainda tinha `node_modules/@aarusso-nyx/devai@1.5.0` da base antiga, enquanto `pnpm-lock.yaml` fixa 1.6.0; `pnpm install --frozen-lockfile` alinhou o ambiente e `pnpm --filter stynx-script-tests test` passou 125/125 mais validação de scripts. Nenhum código ou teste foi alterado.

- Engineer autorização após sensores: `sensor-error` — o teste negava `ops:caser` mesmo com concessão `ops:*`, e o resolver do fixture herdava o alvo de classe em rotas que pretendiam devolver alvo vazio/indefinido. Inspector corrigiu em `02089520`, junto à contagem obsoleta de providers; os testes focados passaram.
- Engineer sessão após sensores: `sensor-error` — dois testes antigos esperavam revogação fora da transição atômica e outro usava store customizado sem essa operação. Inspector fixou `priorSessionId` e ausência de `revoke` separado, e usou o store in-memory atômico no teste positivo em `ee60a6ac`; auth 9/9 e sessions 27/27 passaram. Architect rebinda os seis digests alterados em `law/trace.json`.
- CI integral tentativa 1: `sensor-error` — 15 asserções novas de mera existência violavam WAVE-05A/CW-1. Inspector as tornou comparações exatas, reparou a matriz `it.each` do fator vazio, e as suítes focadas e `lint:tests` passaram; Architect rebinda quatro projeções de trace.
- CI integral tentativa 2: `plant-bug` — `AuthorizationGuard` importava tipos de `authorization.module.ts`, que importava o guard, criando ciclo. Engineer moveu tipos a `authorization.types.ts` mantendo os reexports públicos; `lint:cycles`, backend 84/84, lint e typecheck passaram. Architect rebinda os baselines de três pacotes e `api:baselines` passou 44/44.
- Delivery-review Opus ciclo 1: `reference-gap` — REVIEW com quatro bloqueios e seis melhorias em `reviews/ctg3-delivery-review-1.json`. O contrato agora exige marcador de tenant verificado separado do header, E2E do verdadeiro `forRoot({global:true})`, switch atômico provado em Redis real e falha no boot para store customizado sem a operação atômica. Inclui exportação de opções locais, normalização de fator, documentação do store e limites do Redis, import consumidor e paridade Angular. Inspectors A/B detêm caminhos disjuntos pelos prompts 47/48; após sensores red, Engineers A/B corrigem produção em papéis separados. Rebind de trace/API, CI integral e delivery-review reparado são obrigatórios antes do PR.
- Delivery-review Opus ciclo 2: `plant-bug` — REVIEW em `reviews/ctg3-delivery-review-2.json`: `ModuleRef.get` lança quando o módulo local não foi importado, quebrando o fallback 1.4. Inspector cria E2E sem `StynxAuthorizationModule` antes da correção Engineer. Dois ajustes não bloqueantes entram na mesma tentativa: assert de não revogação do alvo expirado em Redis e mensagem de boot que menciona tenant switch. Prompts 50/51; trace Architect, gates e delivery-review ciclo 3 após o reparo.

- Prompt-review CTG-0003 ciclo 1: `sensor-error` — a ponte DETRAN
  recusou a saída não JSON e removeu o bruto; a execução direta
  `claude -p` com o mesmo prompt produziu um veredito JSON
  `REVIEW`, preservado com recibo de fallback. Cinco lacunas de
  contrato foram identificadas: ordem real de guards, switch real,
  formato configurável de fator, definição de sessão ativa na
  transição Redis e timeout de prontidão. O Architect reparou
  contrato e prompts para o segundo ciclo; nenhum worker de escrita
  foi despachado.
