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
   `packages/backend/test`, `packages-web/angular-auth/test` e specs
   de autorização; não tocar sessions/auth nem arquivos governados.
3. Inspector B: `packages/sessions/test` e `packages/auth/test`, prova
   dos modos, concorrência Redis, fator validado e prontidão. Não
   tocar os caminhos do Inspector A. Testes devem falhar no produto
   atual pelos motivos esperados, sem enfraquecer testes existentes.
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

Contrato e prompts preparados na worktree isolada
`/Users/aarusso/.codex/worktrees/ctg3-authz-session/stynx`.
Ainda não houve despacho de implementação, testes nem PR. A base é
empilhada sobre CTG-0002 e deve ser sincronizada após os merges
anteriores. RC1 e RC2 continuam sujeitos a recibos Owner por versão,
comando e SHA exato antes de qualquer publicação.
