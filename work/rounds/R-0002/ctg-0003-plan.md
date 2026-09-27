# CTG-0003 — autorização e sessão

**Papel:** Architect. **Base de preparação:** CTG-0002 `20f10f53`,
PR #278 aberto; integrar os merges de #276 e #278 antes de publicar
ou mesclar este CTG. **Fonte:** DETRAN C-0002 rev.2 §4, §7 e §8,
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

Contrato e prompts aprovados por Opus no ciclo 2 na worktree isolada
`/Users/aarusso/.codex/worktrees/ctg3-authz-session/stynx`. Inspectors
fixaram 11 sensores no commit `972592b0`; o rebind inicial da trace
foi `1ab1315b`. O Engineer de autorização entregou `dd7f1e15`, com
backend focado 84/84, Angular 59/59 e contracts 15/15. O Engineer de
sessão concluiu a implementação, ainda a commitar separadamente.
Correções de sensores estão em `02089520` e `ee60a6ac`; a trace
407/407 foi rebinda novamente. Falta executar gates integrais,
delivery-review, PR e sincronizar a base após o merge CTG-0002.
RC1 e RC2 continuam sujeitos a recibos Owner por versão, comando e
SHA exato antes de qualquer publicação.

## Triagem

- Engineer autorização após sensores: `sensor-error` — o teste negava `ops:caser` mesmo com concessão `ops:*`, e o resolver do fixture herdava o alvo de classe em rotas que pretendiam devolver alvo vazio/indefinido. Inspector corrigiu em `02089520`, junto à contagem obsoleta de providers; os testes focados passaram.
- Engineer sessão após sensores: `sensor-error` — dois testes antigos esperavam revogação fora da transição atômica e outro usava store customizado sem essa operação. Inspector fixou `priorSessionId` e ausência de `revoke` separado, e usou o store in-memory atômico no teste positivo em `ee60a6ac`; auth 9/9 e sessions 27/27 passaram. Architect rebinda os seis digests alterados em `law/trace.json`.

- Prompt-review CTG-0003 ciclo 1: `sensor-error` — a ponte DETRAN
  recusou a saída não JSON e removeu o bruto; a execução direta
  `claude -p` com o mesmo prompt produziu um veredito JSON
  `REVIEW`, preservado com recibo de fallback. Cinco lacunas de
  contrato foram identificadas: ordem real de guards, switch real,
  formato configurável de fator, definição de sessão ativa na
  transição Redis e timeout de prontidão. O Architect reparou
  contrato e prompts para o segundo ciclo; nenhum worker de escrita
  foi despachado.
