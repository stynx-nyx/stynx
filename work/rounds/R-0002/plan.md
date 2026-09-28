# R-0002 — plano e checkpoint da STYNX 1.5.0

**Papel atual:** Architect. **Estado atual:** CTGs 5–8 implementadas e
importadas sob OD-S15-02; a correção de conformidade do envelope CTG5 e os
follow-ups de observabilidade estão integrados, com delivery-review Opus
PASS. **OD-S15-03:** o Owner incluiu CTG9 (SIG/OBX/OFS, dez MUST da adenda
A1 §8.1) na STYNX 1.5.0. O único gate final ocorre após CTG9. O estado
histórico do bootstrap e das primeiras
CTGs está preservado abaixo. **Branch cumulativa:**
`/Users/aarusso/.codex/worktrees/ctg4-jobs/stynx`,
`feat/release-1-5-0-jobs`, checkpoint original das CTGs 5–8
`81681892696c19979c7983ebff0fb1c0c3c49c8d`; a correção CTG5 e os
follow-ups de observabilidade estão integrados até `b4addd54`.

## Leitura

- STYNX HEAD e `origin/main` no bootstrap: `75b9966a887192121a3904fef7cfd211f8e94465`.
- DETRAN HEAD lido: `220a40202bf4ab17a5ce28b882ad96d60755842f`.
- Lidos: `AGENTS.md`, `CLAUDE.md`, `README.md`, `law/constitution.md`,
  `.devai/pin/constitution.md`, índice e ADRs relevantes de `law/adr/`,
  `law/schemas/`, `docs/meta/development-contract.md`, especificação inteira
  `C-0002-stynx-upstream-spec.md` e §§3, 4, 8, 10 de
  `C-0002-consolidacao.md` no DETRAN (somente leitura).
- OD-S15-01: U1–U15 são MUST; TEN-01 usa middleware no core antes dos guards e
  interceptors; conflito Host × `X-Tenant-Id` é rejeitado. A §8 da especificação
  não continha adendas para SIG/OBX/OFS nesta leitura.
- `codex --help` não pôde ser executado: CLI `codex` ausente do PATH. `claude`
  e a ponte do DETRAN estão presentes. Resolver ids dos modelos antes dos
  despachos/reviews.
- Na retomada, `codex --help` confirmou `-m`; `claude-opus-5-5` foi
  confirmado no catálogo local do Claude Code. A escada do DETRAN nomeia
  `gpt-5.6-terra` para o Inspector médio, e a disponibilidade de
  `gpt-6-sol`/`gpt-5.6-terra` foi confirmada nos modelos Codex desta sessão.

## Linha de base

- `pnpm install --frozen-lockfile`: passou após usar temporariamente o token
  `gh` já configurado como `NODE_AUTH_TOKEN`; o valor não foi impresso.
- `pnpm ci:stynx`: **falhou** em `stynx-db-tests#test` no checkout sem mudanças
  de produto. Catorze suítes de banco reportaram
  `Error: connect ENOENT /tmp/.s.PGSQL.5432`. O Docker daemon também não estava
  disponível em `/Users/aarusso/.docker/run/docker.sock`. Lint, typecheck,
  trace, contrato de API e verificação negativa de RLS chegaram a passar antes
  da falha. Log local: `/private/tmp/stynx-s15-baseline.log` (efêmero).
- Retomada de 2026-09-26: Docker foi iniciado e o Compose da referência subiu
  `postgres`, `redis`, `localstack` e `cognito-local`, todos saudáveis.
  `pnpm ci:stynx` com `STYNX_TEST_PG_HOST=127.0.0.1`, porta `55432`, usuário e
  senha `postgres` passou pelas 17 suítes de `stynx-db-tests`, mas **falhou** em
  `@stynx-nyx/pdf#test`: dois testes de `pdf-renderer.spec.ts` não puderam abrir
  o Chromium headless do Playwright porque o executável não existe em
  `~/Library/Caches/ms-playwright/chromium_headless_shell-1223/...`.
  `stynx-script-tests` foi interrompido pelo Turbo após essa falha. Log local:
  `/private/tmp/stynx-s15-baseline-resume.log` (efêmero).
- O Owner autorizou provisionar a infraestrutura local. Chromium 1223 do
  Playwright 1.60.0 foi instalado pelo CLI do pacote `packages/pdf`; os 22
  testes de `@stynx-nyx/pdf` passaram em execução focal.
- Linha de base final, sem mudanças de produto: `pnpm ci:stynx` **passou** com
  `STYNX_TEST_PG_HOST=127.0.0.1`, porta `55432`, usuário/senha `postgres`.
  Incluiu `check:trace`, `check:rls-negative`, `test`, `test:int`, build e
  doctor do workspace. Log: `/private/tmp/stynx-s15-baseline-provisioned.log`.
- `pnpm exec devai doctor` **passou** (`ok: true`, tier 1). Os controles
  `authority-enforcement` e `trusted-local-rc-boundary` reportaram avisos
  advisory sobre vínculo pós-merge e configuração de RC; reavaliar antes de
  qualquer publicação, sem tratar o doctor como recibo do Owner.

## Decomposição prevista

Cada CTG segue Architect → Inspector → Engineer, com prompt-review antes do
despacho e delivery-review. A antiga regra de CI completo, PR e RC por CTG
foi substituída pela OD-S15-02 para as CTGs 5–8: testes focais por grupo,
importação cumulativa 5 → 6 → 7 → 8, e um CI local completo, um PR, CI remoto
e publicação final após a CTG8. Ordem topológica:

1. tenancy: UPS-TEN-01…06; primeiro RC.
2. SSE: UPS-SSE-01…10, UPS-NGSSE-01…10 e UPS-TEST-01; segundo RC.
   O callback de filtro de UPS-SSE-06 deve funcionar sem UPS-AUTHZ-07 nesta
   etapa; a integração com AUTHZ-07 é responsabilidade do CTG-0003.
3. authz-sessão: UPS-AUTHZ-01…07 e UPS-SES-01…03.
4. jobs: UPS-JOB-01…04.
5. transação: UPS-TXN-01…05.
6. web-kit: UPS-IFM-01…03, UPS-NGERR-01…04, UPS-SHELL-01…04,
   UPS-TEST-02…04.
7. utilitários: UPS-HOOK-01…02, UPS-CAL-01…02 e UPS-NGIDEM-01.
8. cli: UPS-CLI-01.
9. SIG/OBX/OFS: dez MUST confirmados pela adenda A1 §8.1 e incluídos na
   1.5.0 pela OD-S15-03.

Contratos de API, testes, baselines, trace, changesets, package READMEs,
RLS, integração e conformance serão detalhados por CTG e revistos antes do
despacho correspondente. Sem shim nem código copiado do DETRAN.

### OD-S15-02 — paralelismo e gate consolidado

| Frente           | Pode avançar antes da CTG5 estável                          | Espera pelo checkpoint CTG5                             | Lock exclusivo                                                          |
| ---------------- | ----------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| CTG5 transação   | Contrato, testes e implementação próprios                   | —                                                       | `packages/data`, audit, idempotency, backend de comando e DDL 0020      |
| CTG6 web-kit     | Shell, catálogos e entrypoints de teste                     | IFM/ETag e fake `Transaction`                           | Angular UI, auth/i18n testing; Angular source serializado com CTG7      |
| CTG7 utilitários | HMAC, webhook, clock e calendário                           | Idempotência Angular e prova HTTP 409                   | integration-adapter, core/worklist; Angular source serializado com CTG6 |
| CTG8 CLI         | Parser, validação, saída determinística e sensores isolados | Consumidor gerado com `Database.tx`/`Transaction` reais | `packages/cli` e harness exclusivo                                      |

Os checkpoints permitem desenvolvimento em paralelo, mas a importação na
branch cumulativa ocorre em 5 → 6 → 7 → 8 → 9, cada grupo após delivery-review
PASS e gates focais. A integração das CTGs 5–8 já ocorreu até `81681892`.
OD-S15-03 inclui SIG/OBX/OFS na CTG9. Frentes SIG, OBX e OFS podem avançar em
paralelo em arquivos sem lock comum após prompt-review PASS; a ligação OFS→OBX
aguarda a porta de evento OBX estável. A importação CTG9 é serializada pelo
maestro, único executor de Git. Não repetir PRs, RCs ou CI completo por CTG.
Após os dez MUST da CTG9: versionar a candidata estável, executar
`pnpm ci:stynx` e `pnpm ci:reference-apps` uma vez no HEAD consolidado, obter
delivery-review final, abrir um PR, verificar CI remoto e publicar `1.5.0`
com recibos exatos.

### CTG-0001 — tenancy, contrato proposto para prompt-review

**Código atual confirmado:** `StynxCoreModule` registra
`RequestContextInterceptor` como `APP_INTERCEPTOR`; o `ClsModule.forRoot`
compartilhado não monta middleware. `TenantContextInterceptor` chama
`RequestContext.snapshot()` e abre escopo aninhado, logo depende da ordem de
interceptors. `AuthContextGuard` recebe `TenantResolverContext` sem Host/path;
`StynxAuthGuard` hoje pula token em `@Public()`; não há rota pública com tenant.
Tenancy exige UUIDv7 e valida membership em `auth.memberships` antes de
enriquecer o contexto.

**Contrato F1 (Architect):** usar o descritor único e compartilhado
`ClsModule.forRoot({ global: true, middleware: { mount: true, setup } })` em
`StynxCoreModule` para abrir um escopo HTTP uma vez, antes de qualquer guard
ou interceptor, sobre o mount point retornado pelo adapter Express em Nest 11.
Fastify fica sem alegação de suporte verificado neste CTG. O `setup` valida
`X-Request-Id` UUIDv7, gera quando
ausente, define `startedAt`/locale, semeia `RequestContext` e devolve o mesmo
id em `X-Request-Id`. Com vários imports transitivos do core, continua
existindo um único descritor/middleware e um id por request. O
`RequestContextInterceptor` global permanece para **enriquecer** por
`RequestContextMutator.patch` após os guards: `tenantId`, `actorId`, `sessionId`
somente de campos confiáveis colocados por `StynxAuthGuard` ou
`AuthContextGuard`, inclusive apps sem tenancy. Se a classe pública for usada
sem o middleware, mantém sua inicialização direta; nunca reabre escopo quando
`hasActiveContext()` é verdadeiro. A tenancy também apenas enriquece o
contexto existente, inclusive quando seu interceptor roda antes do core.
Nenhum ator ou tenant vem de JWT não verificado numa rota pública com tenant.
O fallback legado de claims não verificadas de rotas `@Public()` simples fica
fora de UPS-TEN-05 neste CTG; não ampliar sua confiança nem alterar sua
semântica incidentalmente.

Criar `@PublicTenantRoute()` e `@PublicTenantRoute({ optionalAuth: true })`
em `auth`, compondo o metadado `STYNX_PUBLIC_ROUTE` com metadado próprio em
`contracts`, sem dependência circular. Os guards devem verificar primeiro o
metadado público com tenant para permitir validação opcional do token. A
ferramenta de rotas (`scripts/list-routes.mjs` e
`scripts/verify-api-coverage.mjs`) deve reconhecer o novo marcador explícito;
Architect amplia `INV-RBAC-001` para incluí-lo sem enfraquecer o deny-default.
O módulo proprietário é `StynxTenancyModule.forRoot({ publicTenant: {
resolveHost({ host, path }), actorId } })`. Uma rota marcada exige esse módulo
e opções completas; configuração ausente ou inválida falha na inicialização.
Definir um token de opções públicas em `contracts`; `auth` ou `core` e
`backend` devem detectar no bootstrap o marcador sem esse token, inclusive em
apps que usam somente `AuthContextGuard`, sem nova dependência de pacote.
`actorId` deve ser UUID RFC válido (v4 ou v7; v7 não é exigido), validado na
inicialização, pois `app.actor_id` sofre cast `::uuid` em auditoria/flow/worklist.
As opções são intencionalmente mais restritas que o
nome proposto no DETRAN: **só Host escolhe tenant**, nunca o cabeçalho. O
framework lê o Host HTTP bruto (`headers.host`; sem confiar implicitamente em
`X-Forwarded-Host` ou `request.hostname` reescrito por proxy), compara o
resultado ao cabeçalho de nome configurável e rejeita divergência antes de
qualquer consulta de domínio. Host A + cabeçalho B, ou Host A + claim
verificado B numa rota `optionalAuth`, → 400 com códigos estáveis
`TENANCY:CONFLICT:host-header` e `TENANCY:CONFLICT:host-claim`, respectivamente.
O pacote `tenancy` lança `StynxError` de **`@stynx-nyx/core`** com
`status: 400` e sem `context`; não usar a classe homônima de `contracts`.
Sem `STYNX_ERROR_TRANSLATOR` registrado, os corpos novos são exatamente
`{"code":"TENANCY:CONFLICT:host-header","message":"Tenant source conflict: Host and X-Tenant-Id disagree"}`
e `{"code":"TENANCY:CONFLICT:host-claim","message":"Tenant source conflict: Host and authenticated claim disagree"}`
(com o nome configurado do header substituindo `X-Tenant-Id` na mensagem).
Com tradutor registrado, `message` pode ser traduzido pelo `messageKey`,
mas `code` e status permanecem estáveis.
Manter `BadRequestException` para tenant ausente, corpo
`{"message":"Tenant context is required: provide X-Tenant-Id, a tenant bearer claim, or a matching subdomain","error":"Bad Request","statusCode":400}`
com o nome de header configurado no texto, e `ForbiddenException` para
`TENANT_ACCESS_DENIED`, corpo
`{"message":"TENANT_ACCESS_DENIED","error":"Forbidden","statusCode":403}`.
Não editar `law/schemas` neste CTG: o filtro atual preserva o corpo de
`HttpException` e serializa `StynxError` como `{code,message,context?}`.
A rota pública exige tenant ativo por consulta separada,
sem membership; se o Host não resolve, retorna 400 com **o mesmo corpo de
tenant ausente** usado pela rota protegida. O ator nominal configurado vai a
`RequestContext.actorId`, e `request.tenantId` é definido, sem roles nem
permissions herdadas. `StynxAuthGuard` e `AuthContextGuard` honram o metadado:
token válido na rota `optionalAuth` segue fluxo autenticado completo, inclusive
membership do ator no tenant do Host. Se o token é válido mas não há membership,
retorna 403 `TENANT_ACCESS_DENIED`, sem downgrade para o ator nominal. Token
inválido/ausente segue fluxo
público, sem identidade extraída do token e sem 401/403. Sem `optionalAuth`, a
rota segue pública. Rota não marcada continua exigindo membership e preserva
`TENANT_ACCESS_DENIED`. Adicionar `host?`/`path?` a
`TenantResolverContext`, fornecidos pelo guard. Em `AuthContextGuard`, uma rota
pública com tenant não usa seu resolvedor legado com `x-tenant-id` fixo:
preserva o principal verificado, mas delega a escolha do tenant ao módulo de
tenancy, que usa o header configurado em suas próprias opções. Rotas protegidas
mantêm o resolvedor legado. Não mudar a semântica dos
caminhos opcionais, header configurável, subdomínio, cache ou mensagens
existentes. Documentar a retirada do patch de protótipo e registrar os novos
códigos no catálogo de erros, preservando códigos legados. Adicionar
`INV-TENANCY-001` com escopo, severidade, prova e âncora F1 própria antes dos
testes; vincular os novos sensores a ele em `law/trace.json`.

**Tarefas serializadas e locks:**

1. Architect (Sol 6): formalizar contrato e decisão de ordem em `docs/`,
   registrar códigos no catálogo de erros e criar `law/invariants/INV-TENANCY-001.json`
   com severidade, escopo e verificação; se necessário, `law/adr/`. Confirmar
   símbolos no código. Nenhum código, teste ou Git. Commit separado de
   Architect pelo maestro com autoria `DEVAI Architect` por tocar `law/`.
2. Inspector (Codex médio): escrever primeiro testes que falhem no baseline
   para duas ordens de módulos/interceptors, guard precontexto, Host A/header
   B, host ausente, token válido/inválido/ausente, ausência de membership,
   `X-Tenant-Id`/claim divergentes, UUID não v7, RLS real com dois tenants,
   `TenantResolverContext.host/path`, Host A/token B, token válido sem
   membership A, token forjado/não assinado, tenant suspenso, ator nominal sem
   permissões, configuração inválida de `actorId`, escrita auditada real com
   ator nominal e RLS do tenant A, corpo/códigos exatos
   e compatibilidade existente. Cobrir auth-only e AuthContextGuard sem
   tenancy, eco de request id, vários imports core, erro de id inválido e
   `core.module.spec.ts` atualizado sem apagar cobertura. `sessionId` só é
   exigido onde há claim de sessão verificada. Não editar F1/F2
   nem Git. Maestro rebind de `law/trace.json` com `INV-TENANCY-001` em commit
   Architect após `pnpm check:trace --print`.
3. Engineer (Sol 6): implementar a API aprovada até os testes passarem, em
   `packages/core`, `tenancy`, `contracts`, `auth`, `backend` e os dois scripts
   de rotas; criar changeset
   do grupo fixo com nota de migração. Nenhum teste/F1/Git. Não tocar
   `package.json` raiz nem manifests de `reference/{api,web}` sem anuência
   explícita do maestro por causa do congelamento de bytes.
   Maestro faz o rebind de baselines com `pnpm api:baselines:write` após
   conferir `.d.ts`, `pnpm package-readmes:write`, negativos RLS, integração e
   `pnpm check:rls-smoke` e `pnpm ci:stynx` antes do PR.

**Gate:** prompt-review Opus 5.5 antes de qualquer tarefa; ciclo 1 retornou
REVIEW com oito itens concretos; ciclo 2 retornou REVIEW com um bloqueio de
UUID do ator nominal e sete itens não bloqueantes. O Owner autorizou uma
terceira verificação excepcional; ela retornou **PASS** com três observações
não bloqueantes, incorporadas ao contrato do worker Architect. O despacho
está liberado. Delivery-review Opus 5.5, CI verde e PASS antes
de merge.
Somente depois preparar RC em pre mode e solicitar recibo Owner para publicar.

## Contrato de status RC versionada no PR #276

O job remoto `release-drafts` chama `pnpm release:status`. O Changesets
`status --since origin/main` rejeita a candidata RC já versionada porque
as 44 versões mudaram e o único changeset foi consumido em `pre.json`.
A rota deve emitir status vazio apenas para uma candidata pre mode `rc`
com marcador explícito de commit de versionamento na primeira linha de
história, 44 manifestos publicados alterados a uma versão prerelease
única, versões iniciais iguais às do `origin/main`, changesets consumidos
listados e presentes, e nenhum changeset pendente. O marcador deve
nomear o mesmo core semântico da candidata; alterações em `packages/`,
`packages-web/` ou `.changeset/` após o commit de versionamento
invalidam a exceção. Para RC posterior, o baseline pode ser outra RC
do mesmo core, com ordinal estritamente crescente e `pre.json`
contínuo. Uma alteração ordinária sem changeset continua falhando pelo
Changesets. O Inspector
fixa positivos e negativos; Engineer implementa sem editar workflow.

## Triagem

- Candidata final `version-packages` primeira execução após `pre exit`: `plant-bug` — Changesets alterou o fork privado `tools/image-size-safe` para 2.0.3 e o SBOM falhou; saída parcial restaurada ao HEAD limpo, wrapper deve preservar byte a byte manifestos/CHANGELOGs privados antes de repetir marcador.
- CTG9 Architect delivery-review ciclo 1: `reference-gap` — OBX não fixou o corte opt-in entre o dispatcher legado e o novo, SIG deixou a verificação criptográfica genérica a cargo do consumidor e OFS deixou a precedência do `Idempotency-Key` indefinida. Os três Architects receberam reparos disjuntos; nenhum Inspector está liberado antes do delta PASS.
- CTG9 Architect delivery-review ciclo 2: `plant-bug` contratual — uma transação pode obter advisory/clock no append, esperar o marker de corte no enqueue e formar ciclo com o cutover que segura marker e espera clock. Fixar ordem global marker → advisory → clock e manter audit fora da transação de corte; testar corrida. Também completar espelhamento de falha pós-corte, claim nativo, headers de replay, status in-progress, replay legado e verificador customizado em produção. Nenhum Inspector está liberado.
- CTG9 Inspector prompt-review ciclo 1: `reference-gap` — testes de composição CTG5/`AuditSqlSink` não cabiam nos pacotes outbox/data, e PKI/health não estavam resolvíveis em signature. Provisionamento Engineer `c21ba672` adicionou dependências/aliases; prompts Inspector incluem backend/audit e reparos de matriz/negativos. Repetir prompt-review antes de despachar.
- CTG9 Inspector prompt-review ciclo 2: `sensor-error` — o sensor A/B/C exigia 55P03 mesmo quando UPDATE só estava enfileirado e SHARE poderia ser concedido. Corrigido para término sem 40P01 nesse caso e 55P03 obrigatório apenas com UPDATE já detido. Acrescentar cancelamento/leitura de recibos OFS, diretórios de composição e changeset signature; Owner já autorizou prompt-reviews adicionais para completar a campanha.
- CTG9 OFS E6×A1: `policy-issue` — sensores E6 exigem dedup por payload hash em outra chave e segundo cancelamento 409; A1 exige chave+hash e repetição terminal idempotente. Contrato Architect seleciona CTG9 quando `OfflineSyncPolicyResolver` é configurado no bootstrap e mantém E6 sem resolver. Testes legados ficam intactos; sensores CTG9 usam resolver determinístico. Review Opus focal antes de Engineer.
- CTG9 OFS review focal ciclo 1: `policy-issue` — 0002 retiraria constraint usada pelo E6, `OfflineSyncStore` cresceria para hosts legados e faltavam sensores do corte bootstrap. Reparos: índice parcial E6/`identity_mode`, interface durável e tipos CTG9 separados, falha de configuração e sensores E6 sobre 0002/ambos os módulos. Ciclo 2 pelo prompt 156; sem Engineer OFS até PASS.
- CTG9 OFS review focal ciclo 2: `sensor-error`/`policy-issue` — a suíte de upgrade usava código 1.5.0 antes de 0002 e um INSERT CTG9 sem `identity_mode`; alguns sensores de bootstrap ainda faltavam na árvore lida. Contract fixa 0002 obrigatório em ambos os modos, erro 503 tipado em 0001 e forma física `identity_mode`; Inspector reordena setup e acrescenta negativos. Ponte falhou por JSON cercado de Markdown e prosa; fallback estruturado REVIEW. Repetir review em árvore congelada antes de Engineer.
- CTG9 OFS review focal ciclo 3: `sensor-error` — transporte 422 reutilizava `batchSequence:1` já fechado, 0002 só testava modo CTG9 com INSERT bruto, e faltava rollback PostgreSQL real por item. Inspector corrige três oráculos; Architect fixa option keys e guard de upgrade sem query extra em unitários E6. Ponte falhou de novo por JSON cercado; fallback estruturado REVIEW. Sem Engineer OFS até review PASS.
- CTG9 SIG/OBX: sensores Inspector independentes commitados em `314d6ba6` (SIG 121 vermelhos/10 verdes; OBX/data/backend/audit 19 vermelhos/2 verdes). Prompt-review 158 separado para liberar apenas Engineers SIG e OBX em write sets distintos enquanto OFS termina; trace será refeito após sensores OFS e antes do gate final.
- CTG9 SIG/OBX Engineer prompt-review 1: Opus `PASS`, três notas não bloqueantes. Prompts 151/152 completados com matriz ADR-0018, adapter SSE estrutural sem dependência backend→outbox e texto de guia/changeset para isolamento. Dois Engineers podem trabalhar em paralelo; OFS continua retido.
- CTG9 OFS review ciclo 4, prompt 159: verificar os três reparos de sensor do ciclo 3 em árvore estável, incluindo transação PostgreSQL real. SIG/OBX já têm PASS independente e foram despachados; OFS segue sem Engineer até PASS próprio.
- CTG9 OFS review ciclo 4: `sensor-error` — ponte mostrou PASS em JSON cercado, mas falhou formatação; fallback estruturado REVIEW encontrou pool do sensor PostgreSQL em superuser, tornando `current_user=stynx_app` e FORCE RLS impossíveis. Inspector vincula app/reader reais e, se viável, levanta 40P01 SQL real. Sem Engineer OFS até novo PASS.
- CTG9 OFS review ciclo 5, prompt 160: pools app/reader vinculados a papéis reais e preflight `rolsuper=false`/`rolbypassrls=false` passou antes da falta esperada de 0002; 40P01 passou a ser SQL real. Revisão focal direta `claude -p` porque a ponte falhou repetidamente ao formatar JSON cercado nos ciclos 2–4; motivo e fallbacks registrados. Engineer OFS ainda retido.
- CTG9 SIG Engineer sensores iniciais: `sensor-error` — Nest 11 pode executar `onApplicationBootstrap` durante `Test.createTestingModule(...).compile()`, antes de `moduleRef.init()`; oráculo deve aceitar recusa em compile/init sem adiar guard. `sensor-error` — positivo de retirada digital esperava relógio injetado, mas a prova RFC3161 assina instante anterior; deve exigir tempo TSA verificado. Inspector SIG corrige somente sensores; Engineer mantém fail-closed.
- CTG9 OFS review ciclo 5: Opus estruturado **PASS** em `reviews/ctg9-ofs-app-role-review-5.json`; app/reader reais, preflight RLS e 40P01 SQL resolveram o bloqueio. Nota opcional: vincular também old-app no sensor 0001-only. Libera commit Inspector OFS e prompt-review Engineer, não implementação.
- CTG9 OBX regressão unitária: `sensor-error` — cinco oráculos de `outbox-depth.spec.ts` congelavam SQL/índice da chamada e não admitem marker `legacy_ownership FOR SHARE NOWAIT` antes do legado. Inspector adapta harness/oráculo para exigir marker antes do DML sem remover asserções de comportamento; Engineer mantém lock.
- CTG9 OFS Inspector commit `1ab3afd5` contém sensores E6/CTG9 e as correções SIG; hook lint verde. Prompt-review Engineer 161 focal pode liberar OFS em write set distinto antes do rebind trace, que aguarda apenas correção do sensor unitário OBX e precede o gate final.
- CTG9 OBX papéis reais: `plant-bug` — os sensores app/reader sob FORCE RLS expuseram falta de grant e política UPDATE para `FOR SHARE` no marker; Engineer reparou migration 0021 com política de visibilidade e negação de mutação. Inspector 9/9 PostgreSQL com preflight sem BYPASSRLS; commit `b4649764`.
- CTG9 OFS Engineer prompt-review ciclo 1: `reference-gap` — contrato citava `Database.assertNoHeldConnection` inexistente e deixava transação in-memory ambígua; corrigidos contrato/ADR/prompt para `hasHeldConnection` e store durável. Ponte rejeitou JSON cercado; fallback estruturado REVIEW por `supertest` ausente. Engineer maestro provisionou dependências em `07518b8b`.
- CTG9 OFS Engineer prompt-review ciclo 2: Opus estruturado **PASS** após supertest, RLS 0002 e atribuição DDL corrigidos; três notas não bloqueantes de semântica E6 de número sem reserva, guard 0002 por SQLSTATE e lease curto incorporadas ao prompt 153. OFS Engineer liberado em write set isolado.
- CTG9 DDL/test-db: root `database/ddl` é bootstrap legado separado, sem schemas platform exigidos por 0021; espelhamento literal quebraria o reset. Migration platform 0021 contém seed `legacy_ownership=LEGACY`. Inspector adicionou sensor platform de migração/seed/RLS em `3477936d`; canonical platform exige decisão de arquitetura se virar produto separado.
- CTG9 SIG delivery-review ciclo 1: `plant-bug` — Opus **FAIL**: o verificador copiava B-LT do perfil pedido, aceitava fixture adbe sem TST/DSS, deixava mínimo QUALIFIED rebaixável, retirada sem declaração própria/autoria comprovada e indisponibilidade como invalidade. A ponte rejeitou JSON cercado; fallback estruturado preserva o FAIL. Architect fixou prefixo PDF incremental coberto pelo ByteRange, declaração de retirada separada e entrada explícita do manifesto; Inspector regenera PKI B-LT e negativos, Engineer repara fonte. Não liberar SIG para commit/publicação antes de novo delivery-review PASS.
- CTG9 OBX delivery-review ciclo 1: `plant-bug` — ponte relatou REVIEW por projeção sem cerca de tentativa/lease, ACK legado com instante fabricado e waits de marker/cutover sem prazo; fallback estruturado confirmou **REVIEW** e bloqueou também status/headers no ledger, ACK/retry 55P03 bruto e alteração indevida de RLS audit. Maestro retirou a mudança RLS de 0021; Engineer corrige fonte. Lacunas A/B/C, ACK tardio e prova de ledger exigem sensores Inspector antes da conformidade. Fonte OBX não liberada para commit até reparo e PASS.
- CTG9 SIG delivery-review ciclo 2: `plant-bug` — ponte novamente devolveu FAIL cercado em Markdown; fallback estruturado confirmou **FAIL** e detectou certificado de signatário não vinculado a SignerInfo/primeiro ESSCertIDv2, fetchers sem contexto ainda obrigatórios, DSS lida por regex, atualização pós-assinatura arbitrária, manifesto/retirada com verifier não marcado e `verifyManifest` indisponível classificado como untrusted. `pdf-lib` foi provisionado em `72e0382b`; Engineer e Inspector repetem implementação/sensores em caminhos separados. Sem commit SIG até PASS.
- CTG9 OFS delivery-review ciclo 1: `plant-bug` — ponte Opus retornou **FAIL** em JSON válido. Chave de item entre dispositivos pode produzir 23505 ou duplo efeito; hash divergente em recibo `received` passa; lease de 30s sem renovação/cerca completa; erro interno/40P01 gera ACK HTTP 201; consumo sobrescreve número aplicado e cancela cauda claimed-local; projeção bloqueada/expirada vira available; E6 escrito após 0002 não tem bridge lazy; path hardcoded quebra prefixo global. Engineer OFS repara fonte/migration; Inspector acrescentará sensores PostgreSQL. Sem commit/publicação OFS até PASS.
- CTG9 OBX delivery-review ciclo 2: `plant-bug`/`sensor-error` — ponte falhou por formato, fallback estruturado deu PASS limitado ao snapshot observado enquanto a fonte mudava. Persistência pós-envio precisa de resultado por linha e reconhecimento de `SerializationFailureError.context.code=40P01`; deadline de retry não pode virar `statement_timeout`. Engineer repara fonte, Inspector prova ramos posteriores e a regressão de oráculo `lockTimeoutMs`. Notas do review sobre backoff de ACK negativo, vazamento de timeout na transação do chamador, wait owner sem prazo e admissão SSE simultânea serão fechadas antes da conformidade; repetir review após congelar bytes.
- CTG9 SIG delivery-review ciclo 2: `sensor-error` residual — oráculos legados de fetchers contradiziam a prova B-LT embutida e manifesto positivo exigia dois signatários mas só anexava um. Inspector preservou negativos com OCSP/CRL/TSA embutidos, completou manifesto e acrescentou fixture A/B spoof; 180/180, typecheck e lint verdes no commit `02c568a0`. Engineer SIG reparou fonte; review ciclo 3 em andamento.
- CTG9 SIG delivery-review ciclo 3: `plant-bug` — Opus FAIL por CMS attached aceito apesar de ByteRange, identidade do signerId não presa ao certificado, xref pós-assinatura contornável e frescura OCSP/CRL invertida. Engineer reparou os quatro; Inspector `7ce7e10e` adicionou attached CMS, A/B distinto, xref free/shadow e pós-TST, com 194/194. Review ciclo 4 obrigatório.
- CTG9 SIG delivery-review ciclo 4: `plant-bug` — Opus FAIL por xref efetivo ainda contornável via catálogo sombreado em stream, XRefStm híbrido e trailer duplicado. Fonte e sensores repetem; nenhuma assinatura é declarada conforme até PASS. A divergência textual do hash de retirada foi resolvida pelo Architect: catálogo do prefixo PDF assinado é vínculo aceito.
- CTG9 OFS delivery-review ciclo 2: `plant-bug`/`policy-issue` — fallback estruturado FAIL por conflito pré-item que aborta o lote, número sem cobertura/série inequívoca e projeção consumed como disponível. Prompt 153 dizia explicitamente aceitar número sem reserva com semântica E6; Architect limita essa compatibilidade ao modo E6, exige cobertura em CTG9, adiciona reservationId opcional e recibo de duplicata indexado pelo queueItemId submetido. Prompt-review focal 172 antes dos sensores Inspector; UPS-OFS-04 evidência/resolução/settle/janela continua MUST apesar de nota não bloqueante do reviewer.
- CTG9 OFS prompt-review delta 172: `sensor-error`/`policy-issue` — fallback estruturado FAIL por oráculo Inspector antigo que exige queueItemId original em duplicata e por falta de códigos/status/precedência para numeração. Architect fixou tabela de quatro resultados neutros e mapeamento host, elegibilidade `reserved`, `validUntil` vs `createdLocallyAt`, lock na transação do item, projeção consumed e 400 de chave duplicada no lote CTG9. Inspector corrige e amplia sensores; novo prompt-review focal ocorrerá com oráculo coerente. Nenhuma conformidade OFS é declarada.
- CTG9 SIG delivery-review ciclo 5: `plant-bug` — a ponte retornou FAIL cercado em Markdown (formato recusado). O parser ainda isentava offset de catálogo e ignorava entradas xref no prefixo assinado; regex de cabeçalho não corresponde ao léxico pdf-lib para comentários/NUL/objetos adjacentes. Fallback estruturado em andamento; Engineer e Inspector terão de fechar a contraprova antes de commit SIG.
- CTG9 OFS prompt-review focal 2: `policy-issue` — Opus FAIL porque ALREADY_APPLIED estava como `conflict`, mas DETRAN registra `rejected` com conflito de domínio. Architect corrigiu a tabela e explicitou evidência aberta para NO_COVERAGE/AMBIGUOUS, cauda liberada de cancelamento e precedência de número aplicado. Inspector/Engineer repetem sensores/fonte; revisão focal 3 antes do delivery-review. Lacunas PG de códigos/TTL offline e identidade de recibo permanecem obrigatórias.
- CTG9 API baseline preliminar: `sensor-error` de ambiente no primeiro build, pois `@angular/router` declarado não estava linkado em `node_modules`; `pnpm install --frozen-lockfile` restaurou o grafo e o build `angular-ui` isolado passou. O build integral antecipado ainda falhou com saída truncada enquanto OFS fonte mudava; repetir com log completo após congelamento, sem rebind em `law/` a partir de snapshot instável.
- CTG9 OFS delivery-review ciclo 3: `plant-bug` — Opus encontrou bypass de `context_hash`, sequência e fingerprint quando a primeira transação recebe `55P03` no advisory de lote; uma requisição divergente podia receber replay ou tomar lease e aplicar item não declarado. A ponte devolveu JSON cercado e saiu 4; fallback estruturado foi solicitado. Engineer revalida a identidade na recuperação; Inspector acrescenta sensor PostgreSQL do lock contendido e cobre divergências de paridade de projeção, números, contagem e applier. Rebind API foi interrompido enquanto a fonte muda; sem commit OFS ou conformidade antes de novo PASS.
- Release final prompt-review ciclo 1: `reference-gap` — Opus REVIEW em JSON cercado (ponte saiu 4): política Architect não fixava owner_decision/supersedes, allowlist pós-marcador era vaga, posição de `pre exit` indefinida e teste vermelho antes do versionamento não identificado. Política final Architect `1a0d7a9a` e contrato/prompt foram fechados para segundo ciclo.
- Release final prompt-review ciclo 2: `sensor-error` — Opus REVIEW: teste da linha 1503 ainda exigia RC nos manifestos reais e recusava tag estável, o que falharia após o marcador. Architect fixa roster sintético da candidata 1.5.0 nesse sensor, preserva ordem/canário/releituras e deixa igualdade do workspace real só no teste 345. Define também forma de markerCommits/packageStates e igualdade estrutural do pre state pai/base. Prompt-review focal 3 antes do Inspector.
- Release final prompt-review ciclo 3: `sensor-error` — Opus REVIEW: o negativo VERSION_DRIFT mutava manifesto para 1.5.0, que agora é a candidata; portanto nunca lançaria. Architect fixa mutação para RC3, explicita remoções estritas de oráculo RC, renomeia o título com rebind trace e adiciona positivo latest=1.5.0/rc=rc.2. Prompt-review focal 4 antes do Inspector.

- CTG5 envelope sensores pós-despacho: `sensor-error` — o unitário exigia o envelope completo em `HttpException.getResponse()` antes do filtro HTTP resolver `requestId`, e uma asserção antiga de proveniência ainda esperava `{code}`; o Inspector limitou o unitário a status/código interno e fortaleceu a prova HTTP do 403 completo, seguido de rebind Architect de trace.
- CTG5 envelope Inspector tentativas 1–2: `reference-gap` — os sensores entregues provaram vermelho em PostgreSQL, mas ainda faltam caminhos 400/403/500/503, filtros, If-Match, unitários e controles duráveis exigidos pelo prompt 105; após a nova tentativa parcial, a conclusão dos sensores foi escalada ao maestro no papel Inspector antes de qualquer commit Inspector.
- RC2 delivery-review Opus ciclo 1: `policy-issue` — a política de anomalia e o publicador ainda fixavam `rc.1` apesar dos 44 manifestos em `rc.2`; Inspector acrescentou prova vermelha de igualdade e da transição `rc.1 → rc.2`, Architect vincula a decisão Owner existente à candidata exata, Engineer atualiza o candidato e o digest; repetir gates e review antes do PR.
- RC2 `release:status`: `policy-issue` — o primeiro commit de versão tinha assunto fora do marcador canônico; o maestro reconstruiu a sequência local sem mudar a árvore e o gate passou com `chore(repo): version 1.5.0 release candidate`.
- Delivery-review CTG-0004 ciclo 1: `plant-bug` — `timezoneFormatter` rejeitava zonas IANA canônicas com hífen ou dígito e `enqueue` enviava ator explícito malformado ao PostgreSQL; Inspector registrou testes vermelhos em `24ef81a7`, Engineer corrigiu em `6493be3d`, e Architect refez o vínculo de trace. As provas PostgreSQL negativas e os valores fixos do seed também foram ampliados.
- `ci:reference-apps` pré-integração CTG-0004: `reference-gap` — o branch empilhado ainda usa o fixture SSE anterior à correção `useTemplate: false` do CTG-0002; repetir após replay sobre o merge do PR #285, preservando o fixture corrigido.
- Follow-up datado 2026-09-27, CTG-0004 delivery-review pós-integração: a busca de cron local percorre minuto a minuto fora de `UTC`. O Opus mediu `America/Sao_Paulo` em 2,3 s para `0 0 1 1 *`, 5,5 s para `0 0 29 2 *` e 13,9 s para `0 0 31 2 *`, contra 73 ms no UTC para o primeiro caso. `upsertSchedule` calcula antes de validar o caller; `materialize` calcula sob `FOR UPDATE SKIP LOCKED`. Meta do reparo: o caso impossível `0 0 31 2 *` deve encerrar em até 500 ms no runtime de CI, com teste temporal e manutenção das provas DST de Nova York/São Paulo; pular meses/dias/horas não correspondentes antes da varredura de minutos. O reviewer classificou o custo como não bloqueante para UPS-JOB-01…04, mas ele deve constar na orientação ao consumidor até ser corrigido.
- Follow-up datado 2026-09-27, CTG-0004 delivery-review pós-integração: tanto `jobs.schedules.timezone` quanto `cron_expression` inválidos podem ser gravados por `stynx_app` sob RLS do próprio tenant (`0018_jobs.sql` concede `INSERT` e `UPDATE`; `0019` não impõe CHECK de validade). Um único schedule assim pode lançar dentro de `materialize`, reverter o lote owner e bloquear materialização de outros tenants. A API de serviço valida entradas normais, mas o alcance por SQL direto é real e o efeito cruza tenants. Reparo: isolar a falha por linha, desabilitar o schedule inválido com motivo observável e provar com PostgreSQL real as vias `INSERT` e `UPDATE` e que um tenant não bloqueia o outro. Não alterar grants nem RLS; CHECK SQL portátil de timezone não é solução. O reviewer classificou como risco preexistente não bloqueante da CTG-0004.
- CI CTG-0004 após os sensores do ciclo 2: `sensor-error` — `lint:tests` recusou duas asserções `.toBeNull()`; Inspector manteve a mesma comparação de valor com `.toEqual(null)` em `8f75e9a7`, integração PostgreSQL passou e Architect refez o digest de trace antes de repetir o CI.

- CI CTG-0002 após reparo Angular: `reference-gap` — o build emitiu novo digest para `types/stynx-nyx-angular.d.ts`; Architect confirmou a mudança e executou `pnpm api:baselines:write` para rebinder o baseline, sem edição manual de artefato gerado.

- RC2 `ci:stynx`: `sensor-error` — os sensores congelavam a versão RC1 e o hash bruto do manifesto raiz; Inspector normalizou apenas a linha de versão RC e validou o roster de 44 pacotes contra a candidata corrente, 125+4 testes focais verdes; Architect rebinda `law/trace.json` (851 e 267 asserções).
- RC2 `ci:reference-apps`/`release:consumer-fixtures` concorrentes: `sensor-error` — duas compilações disputaram `dist` no mesmo checkout; a repetição sequencial passou 62/62 testes de referência e 44 tarballs em três consumidores.
- RC2 primeiro commit Inspector: `policy-issue` — o escopo Conventional Commit `release` não pertence ao enum do repositório; a nova tentativa usou `stynx-workspace` e passou sem alterar os testes.

- CTG-0002 linear `ci:reference-apps`: `sensor-error` — a fixture SSE clonou `stynx_int_tpl` já migrado e tentou recriar schemas `tenancy`/`auth`; o mesmo teste focal passou com banco vazio. Inspector fixou `useTemplate:false` só nessa fixture em `55d43ebd`; o teste focal passou também com o template ativo, preservando PostgreSQL real e os dois tenants. `check:trace --print` permaneceu 403/403 e não produziu rebind porque as 37 asserções catalogadas não mudaram. Repetir integração/RLS no HEAD final.
- CI CTG-0002 após integrar `main` em `65f982a5`: `sensor-error` — o Testcontainers do teste de integração `@stynx-nyx/flow` excedeu 10 s aguardando portas do PostgreSQL sob a carga do CI local; o pacote passou isolado, 60/60 testes, sem alteração de código. Em `3447f73f`, a segunda execução completa de `pnpm ci:stynx` passou (`/private/tmp/stynx-s15-ctg2-postmain-ci-retry.log`), assim como `pnpm ci:reference-apps` (`/private/tmp/stynx-s15-ctg2-postmain-reference-ci.log`). O delivery-review Opus após a integração deu PASS em `reviews/ctg2-postmain-delivery-review.json`; os recibos Owner do merge ainda bloqueiam o push.
- RC1 `release:consumer-fixtures` após reparo do status: `sensor-error` — uma instalação temporária do fixture TEAT omitiu dois pacotes apesar de o pack dos 44 ter concluído; nova execução com fixture preservado passou 44/44 e três consumidores, sem mudança de código.
- CI CTG-0002 após reparo Angular: `reference-gap` — o build emitiu novo digest para `types/stynx-nyx-angular.d.ts`; Architect confirmou a mudança e executou `pnpm api:baselines:write` para rebinder o baseline, sem edição manual de artefato gerado.
- Reparo CTG-0002 poison row: `sensor-error` — `source().cursors` registra o cursor de entrada de `listSince` na primeira leitura; o sensor exige um segundo tick para observar o avanço após os drops. Inspector corrige o sensor sem alterar implementação nem enfraquecer as provas de drop/métricas.

- PR #276 `release-drafts`: `plant-bug` — `release:status` tratou a RC já versionada como alteração ordinária e o Changesets recusou os 44 manifestos sem changesets pendentes. O contrato acima define uma exceção fechada para pre mode versionado; testar antes de implementar.

- Delivery-review da rota RC1 ciclo 1: `sensor-error` — faltavam
  negativos diretos do preflight de dist-tags, canário, limite de
  releituras e tag estável; Inspector ampliou sensores, Engineer ligou
  validação pura do roster e recibos com motivo de parada. O reviewer
  também identificou referência errada à última tag estável, corrigida
  abaixo antes do segundo ciclo.
- Sensores publicação RC1 após Inspector: `sensor-error` — o primeiro
  red não exercita mutação de tag histórica, modo padrão com changeset
  pendente nem preservação de `--access restricted`; completar essas
  asserções uma vez antes do commit Inspector, sem reduzir as demais.
- RC1 forbidden-actions local: `policy-issue` — check desde
  `e09bd6c0` apontou `FORBID-PUBLISH` em três commits só de contrato
  (`19730677`, `9ad74570`, `0106a12e`) por texto literal de comando,
  e `FORBID-MUTATE-INVARIANTS` no commit Auditor `07b3cb47` de
  evidência DEVAI. Nenhuma publicação ocorreu; resolver a autoridade
  por recibos exatos do Owner antes do PR/merge, sem apagar provas.
- Prompt-review publicação RC1 ciclo 1: `reference-gap` — plano sem
  módulo puro testável para dist-tag/argumentos/pós-check e com pre-state
  de final ambíguo; contrato e prompts reparados para segundo ciclo.
- Prompt-review publicação RC1 ciclo 2: `policy-issue` — a exigência de
  nenhum changeset pendente no `release:policy` padrão bloquearia PRs
  normais durante pre mode; restringida à verificação de publicação.
  Dois ciclos REVIEW consumidos; solicitar autorização excepcional do
  Owner antes de terceiro prompt-review. Nenhum worker da rota foi
  despachado.
- Sensores RC1 após primeiro despacho Inspector: `sensor-error` — os
  casos de plano/pre-state ficaram red como esperado, mas faltou prova
  da pós-condição de `changeset version` (IDs consumidos, tag e ordinal
  gerado); uma complementação focal antes do commit Inspector.
- RC1 após CTG-0001: `plant-bug` — `pnpm version-packages` em pre mode
  `rc` deixou os 44 pacotes em `1.5.0` estável após Changesets gerar
  `2.0.0-rc.0` por inferência de peers; corrigir a projeção do grupo
  fixo antes de qualquer publicação, com sensor Inspector e novo review.
- Prompt-review RC1 ciclo 1: `plant-bug` — o ensaio de versionamento
  consumiu `tenancy-context-15` em `.changeset/pre.json` mesmo após a
  restauração dos manifestos. Reposto `changesets: []`, exatamente como
  `pre enter rc`; commitar esse estado inicial para reprodução. A rota de
  publicação existente fixa `--tag latest`; RC exige triade separada para
  selecionar `rc` e provar que `latest` é recusado antes do recibo Owner.
- Prompt-review RC1 ciclo 2: `plant-bug` — faltava detectar divergência
  entre IDs consumidos em `pre.json`, arquivos `.md` e versão dos
  manifestos; contrato e sensores foram ampliados. O limite de dois
  ciclos REVIEW foi atingido; terceiro review só com autorização
  excepcional do Owner. Nenhum worker da tríade RC foi despachado.
- DEVAI `audit observe` do merge: `policy-issue` — primeira chamada
  observou o SHA mesclado enquanto HEAD local ainda apontava ao PR;
  avançar a worktree ao merge commit exato e repetir uma vez; concluiu.
- Delivery-review CTG-0002 ciclo 1: `sensor-error` — faltavam provas de retomada/preflight em PostgreSQL/RLS real e resolução consumidora da entry Angular testing. Prompt de reparo aprovado por Opus no ciclo 2; Inspectors acrescentam sensores sem alterar produção, Engineers corrigem após os commits de testes.
- CI local após override `adm-zip`: `reference-gap` — três sensores D21,
  D22 e D16.1 congelam o SHA antigo do `package.json` raiz; Inspector
  substitui somente esses três digests pelo SHA exato após o override,
  mantendo todos os demais pins e a asserção de igualdade. Precedente
  histórico do próprio STYNX: `2b1257e5`.
- CI local após reparos do PR #272: `plant-bug` — o contrato novo tinha link
  relativo válido no checkout, mas inválido após cópia para `site-docs`;
  Architect aponta à nota de migração no repositório e repete o build uma vez.
- CI remoto PR #272 `semgrep`: `sensor-error` — detector de segredo identificou
  um JWT estrutural fictício literal no teste do guard; Inspector mantém a
  prova e monta o token em runtime, depois rebind do trace pelo Architect.
- CI remoto PR #272 `dependency-audit`: `reference-gap` — override raiz
  herdado fixa `adm-zip@0.6.0` transitivo de `github-actionlint`, agora
  vulnerável; Engineer atualiza o override/lockfile a 0.6.1 corrigido sem
  editar workflows e repete os gates uma vez.
- Delivery-review CTG-0001 ciclo 4: `plant-bug` — refresh JWKS concluído
  dentro da janela de 30 s ainda classifica toda assinatura inválida como
  falha ambígua; Architect esclarece o contrato, Inspector muda o sensor
  para credencial inválida tipada após refresh recente e mantém falha fechada
  com cache anterior/refresh falho, Engineer corrige uma vez.
- Delivery-review CTG-0001 ciclo 4: `sensor-error` — faltam falha de refresh
  via `jwksUri` com restauração garantida de `fetch` e HTTP de erro JWKS no
  guard STYNX; Inspector acrescenta e estende a tabela de códigos JOSE.
- Reparo JWKS CTG-0001: `sensor-error` — um teste antigo juntava JWKS
  inicialmente vazio a sucesso após refresh, contrariando o novo contrato de
  falha de fonte; Inspector separou o negativo de chaves vazias do teste de
  claims opcionais com JWK RSA utilizável e repetiu a suíte focal.
- Delivery-review CTG-0001 ciclo 3: `sensor-error` — fixture invertia a
  lista global de interceptors após `app.init()`, tarde demais para a cadeia
  das rotas do Nest; Inspector força a ordem antes do registro e observa a
  execução por requisição, preservando a prova do ID gerado.
- Delivery-review CTG-0001 ciclo 3: `plant-bug` — JWKS vazio foi tratado como
  assinatura inválida, e cache remoto não atualizava numa falha de assinatura;
  Architect fixa o contrato de fonte/chave/refresh, Inspector acrescenta
  negativos e Engineer corrige uma vez.
- Delivery-review CTG-0001 ciclo 3: `sensor-error` — faltam ramos HTTP de
  `InvalidCredentialError`, falha JWKS, sessão revogada e sensores de códigos
  JOSE, marcadores e claims upstream; Inspector acrescenta sem enfraquecer os
  casos existentes e Architect faz rebind.
- Reparo focal CTG-0001 de proveniência: `sensor-error` — a nova fixture
  exigia roles/permissões de identidade upstream sem marcador apesar de o
  contrato exigir ator nominal sem autoridade herdada; Inspector corrigiu a
  expectativa para listas vazias e a integração PostgreSQL passou 38/38.
- Reparo focal CTG-0001: `sensor-error` — fixtures antigos simulavam
  credencial definitivamente inválida com `Error` genérico, e `toHaveProperty`
  do Vitest não aceita chave `symbol`; Inspector troca só essas fixtures por
  `InvalidCredentialError` e asserção direta do marcador, preservando os
  negativos de falha de infraestrutura, e repete uma vez.
- Delivery-review CTG-0001 ciclo 2: `plant-bug` — catch amplo em dois verificadores rebaixa indisponibilidade JWKS/serviço a ator nominal, e tenancy aceita principal sem proveniência; escalar ao Architect para discriminar credencial inválida, infraestrutura e fonte de claim, depois nova tríade focal.
- Delivery-review CTG-0001 ciclo 2: `sensor-error` — faltam negativos de sessão revogada, identidade anterior e grant verificado, além de prova explícita de inversão APP_INTERCEPTOR/id gerado; Inspector acrescenta, Architect faz rebind e repete uma vez na tarefa escalada.
- Revisão interna CTG-0001 de marcadores combinados: `plant-bug` — @System ainda contornava @Permission em rota pública com tenant e AuthContextGuard deixava stynxClaims anterior com token inválido; Inspector adicionou sensores, Engineer corrige uma vez.
- Sensor de PermissionGuard CTG-0001: `sensor-error` — mock não declarava STYNX_PUBLIC_TENANT_ROUTE e modelava @Public legado; Inspector adicionou o marcador e o sensor passou.
- Revisão interna do reparo CTG-0001: `plant-bug` — PermissionGuard passou a negar @Public legado com @Permission, e AuthContextGuard optional conservava identidade anterior em token ausente/inválido; Inspector adicionou regressões, Engineer corrige sem alterar rotas protegidas.
- Commit Inspector do reparo CTG-0001: `sensor-error` — hook ESLint encontrou import `Module` não usado no novo sensor de duas ordens; Inspector remove o import e repete o commit uma vez.
- Delivery-review CTG-0001 ciclo 1: `sensor-error` — faltam provas HTTP de duas ordens de módulos, ambos os guards reais, cabeçalhos configurados, RLS positivo e casos de contexto; Inspector acrescenta sensores, Architect faz rebind e repete uma vez.
- Delivery-review CTG-0001 ciclo 1: `plant-bug` — entitlement de principal verificado, alcance global de tenancy e descoberta de marcador herdado exigem reparos de código após contrato Architect e sensores Inspector; Engineer corrige e repete uma vez.
- Engineer CTG-0001 autenticação opcional: `plant-bug` — `catch` amplo
  rebaixava token já verificado a público quando cache/mapeamento falhava;
  Inspector acrescentou negativas em `7d513da7`, Engineer restringe o
  tratamento de erro e repete os testes uma vez.
- Inspector CTG-0001 CLS: `sensor-error` — o unit test procurou `useValue`
  de opções em `ClsModule.forRoot().providers`, mas `nestjs-cls` 6.2.1 as
  guarda no import aninhado `ClsRootModule`; corrigir a introspecção e repetir
  uma vez. O teste real de pre-guard já passou, sem provider fictício.
- Inspector CTG-0001 RLS: `sensor-error` — os pools do helper usam o
  superusuário `postgres`, que contorna FORCE RLS; `stynx_reader` não tem
  acesso a `audit.events`. Na transação de leitura do teste, usar
  `SET LOCAL ROLE stynx_app` e verificar `current_user` antes da consulta B;
  repetir a prova uma vez sem reduzir a asserção de isolamento.
- Inspector CTG-0001: `sensor-error` — `lint:tests` R19-W06 recusou import
  relativo de `auth/src` no novo teste de integração; corrigir pelo alias do
  pacote e repetir o gate uma vez.
- Commit Architect CTG-0001: `policy-issue` — commitlint recusou o escopo
  `tenancy`, ausente da enumeração; repetir uma vez com o escopo `repo`.
- Baseline 2026-09-26: `reference-gap` — infraestrutura PostgreSQL local
  ausente (`ENOENT /tmp/.s.PGSQL.5432`); Docker daemon indisponível. Não é
  falha atribuída a mudança da 1.5.0.
- Baseline retomada 2026-09-26: `reference-gap` — binário Chromium headless
  requerido pelo Playwright não está instalado; nenhuma mudança da 1.5.0.
- Prompt-review CTG-0001 ciclo 2: `policy-issue` — dois resultados `REVIEW`
  consumiram o limite do prompt do maestro; o Owner autorizou terceira
  verificação excepcional, que retornou PASS.

## Retomada

1. **Retomar esta worktree e esta rodada; não recriar nem replanejar.** A
   linha de base e o CI local da entrega CTG-0001 estão verdes. Prompt-review
   foi executado três vezes por Opus 5.5 via ponte, com REVIEW, REVIEW, PASS.
2. Os containers da referência devem continuar saudáveis; usar as quatro
   variáveis `STYNX_TEST_PG_*` acima nos gates locais. Chromium Playwright
   1223 já está instalado no host.
3. O CTG-0001 foi mesclado no PR #272 em
   `e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`. O último CI local
   completo passou com trace 393/393, PostgreSQL/RLS reais, baseline API
   44/44, auth 234/234, tenancy 39/39, testes 97/97, integração 51/51 e
   build 48/48 tarefas; todos os checks obrigatórios remotos passaram.
   Delivery-review Opus ciclos 5 e 6: PASS. DEVAI evidence record e
   audit observe do merge concluídos. Preparar RC1 em pre mode.
4. Conferir de novo a §8 da especificação antes de congelar o escopo.
5. `pnpm release:preview` confirmou 1.4.0 → 1.5.0 pelo versionador do grupo
   fixo. `pnpm api:baselines:write` e `pnpm package-readmes:write` não
   produziram diff; o check DEVAI de ações proibidas passou sem findings.
6. RC1: `pre enter rc` está commitado com `changesets: []` em `c011d259`.
   O ensaio inicial de `version-packages` foi revertido sem publicação.
   Prompt-review Opus retornou REVIEW nos ciclos 1 e 2. As correções do
   ciclo 2 estão preparadas neste checkpoint. O Owner autorizou
   expressamente o terceiro prompt-review excepcional em resposta ao
   checkpoint de `053091a0`. Só despachar Inspector
   após PASS. A rota de publicação `--tag latest` permanece bloqueada
   para RC até tríade separada e revisão de entrega.
7. O CI integral da candidata versionada passou com exit 0 no SHA
   `f4bbcb2d071dcbe08390987377c4d9af231aae88`: comando
   `STYNX_TEST_PG_HOST=127.0.0.1 STYNX_TEST_PG_PORT=55432
STYNX_TEST_PG_USER=postgres STYNX_TEST_PG_PASSWORD=postgres pnpm
ci:stynx`, log `/private/tmp/stynx-s15-rc1-ci.log`. Trace 393/393,
   testes de script 114/114, tarefas test 97/97, integração 51/51,
   build 48/48, doctor/RLS verdes. Commits posteriores até
   `5de7b18b` alteram somente documentos da rodada. Delivery-review
   versionamento ciclo 1: PASS. PR de preparação RC ainda bloqueado
   pelos achados DEVAI de autoridade; publicação exige outro recibo.
8. O Owner autorizou excepcionalmente o terceiro prompt-review da rota
   de publicação e os quatro recibos DEVAI de SHA já identificados,
   em resposta ao checkpoint de 2026-09-26. Registrar os recibos
   exatos em `law/policy/forbidden-action-authorizations.json` e
   executar novamente o check antes de abrir PR. Esta autorização
   não é o recibo de publicação: esse ato ainda exige comando e SHA
   candidato finais.

9. A preparação RC1 está no PR #276. `main` avançou para DEVAI 1.6.0
   (`78a0f4ba`) e foi integrado por `3383be94`. Os recibos exatos de
   `3383be94` e `17d87afa` foram vinculados; DEVAI strict desde
   `a46ecb88` passou com zero achados. SBOM, hash do manifesto raiz e
   testes locais foram rebindados por papéis separados. A revisão Opus
   do delta retornou REVIEW somente porque o CI completo ainda executava.
   O CI integral concluiu com exit 0 no SHA `84743f85`; o record
   contém o log. Obter PASS no ciclo 2 e atualizar PR #276.
10. Após o merge de #276, executar DEVAI strict no SHA mesclado antes de
    pedir recibo de publicação. A ocorrência do merge, se houver,
    precisa de recibo por SHA exato. A publicação `1.5.0-rc.1` continua
    bloqueada até recibo Owner separado que nomeie comando e SHA.

11. **Checkpoint de parada em 2026-09-27.** O delivery-review Opus
    do delta de main, ciclo 2, retornou FAIL; ver o arquivo local
    `reviews/rc1-main-integration-delivery-review-2.json`. O motivo
    é o commit `c4b926b76f6716b82f0e2d68f1a3210d78acb692`,
    que adicionou duas citações de comandos vedados no artefato de
    revisão anterior, detectadas como `FORBID-RM-RF` e
    `FORBID-PUBLISH`. A próxima retomada deve vincular recibos Owner
    para esses dois pares exatos (texto de revisão, sem execução),
    executar DEVAI strict desde `a46ecb88` e obter novo PASS antes
    de push/merge. Não commitar o JSON de review do ciclo 2 sem
    considerar que ele contém citações capazes de criar novos
    achados. PR #276 remoto permanece no HEAD `48e534f7` e com
    conflito; o trabalho local chegou a `c4b926b7` mais este
    checkpoint. RC1 e final não foram publicados.
12. O CTG-0002 SSE está na worktree
    `/Users/aarusso/.codex/worktrees/ctg2-sse/stynx` em
    `a72276fd`. CI local e `ci:reference-apps` passaram. O
    delivery-review Opus ciclo 1 retornou REVIEW em
    `reviews/ctg2-delivery-review-1.json`: faltam duas provas
    obrigatórias (resume/preflight real PostgreSQL/RLS e resolução
    consumidora do entry Angular testing). Há seis melhorias não
    bloqueantes. Nenhum PR CTG-0002 foi aberto.

13. Retomada autorizada em 2026-09-27: os dois recibos do
    commit `c4b926b7` foram vinculados em `7eee34de`; DEVAI strict
    passou (zero achados, 16 recibos aplicados). O terceiro
    delivery-review Opus do delta retornou PASS. Preservar os
    vereditos originais; o commit de evidência que os inclui poderá
    produzir novos achados por texto citado e deverá ter recibo
    exato antes do push. Então repetir DEVAI strict, enviar PR #276,
    aguardar CI remoto e mesclar.
14. O PR #276 passou todos os checks remotos e foi mesclado em
    `a3c8164524f15a74da264952162066446350b575`.
    DEVAI strict pós-merge passou sem achados; política, proveniência,
    monotonicidade autenticada dos 44 pacotes e três fixtures de
    consumo passaram. O opt-in Owner do workflow permanece `false`.
    Publicar RC1 exige recibo separado do Owner para o SHA exato e
    a habilitação desse opt-in.
15. O PR #278 do CTG-0002 SSE foi aberto em `20f10f53`, após CI local e
    delivery-review Opus PASS. A branch incorporou a nova `main` pelo
    merge `65f982a5a39e644a0dc66ea7e6813540d333be5a`; o único
    conflito foi a união das linhas de triagem neste plano. Trace
    398/398, API baseline 44/44 e READMEs gerados passaram. DEVAI
    strict identificou quatro recibos de autoridade necessários no
    merge de integração: `FORBID-RM-RF`, `FORBID-CI-WITHOUT-ADR`,
    `FORBID-PUBLISH` e `FORBID-MUTATE-INVARIANTS`, todos vinculados ao
    SHA `65f982a5a39e644a0dc66ea7e6813540d333be5a`. São
    ocorrências do conteúdo incorporado de `main`, não execuções
    adicionais. Aguardar recibo Owner exato, vincular em `law/policy/`,
    repetir DEVAI strict e os gates antes de atualizar o PR.
16. Após a integração, `ci:reference-apps` e o segundo `ci:stynx`
    passaram; a primeira tentativa de CI sofreu timeout intermitente
    do container PostgreSQL em `@stynx-nyx/flow`, e o teste focado
    60/60 confirmou a triagem antes do rerun integral. O delivery-review
    Opus pós-main retornou PASS em `reviews/ctg2-postmain-delivery-review.json`.
    A documentação SSE recebeu o exemplo de adapter lazy em `0b77dd45`
    e `package-readmes:check` passou. O PR #278 remoto ainda está no
    HEAD anterior; atualizar somente depois dos recibos pendentes.
17. O Owner autorizou os quatro recibos exatos para `65f982a5` e eles foram
    vinculados no commit Architect `70b9ddc0`; DEVAI strict deu zero achados.
    A CTG-0002 integrou a cobertura de tenancy de `main` em `6c3c9303`.
    `pnpm ci:stynx` e `pnpm ci:reference-apps` passaram em
    `/private/tmp/stynx-s15-ctg2-main-a2f-ci.log` e
    `/private/tmp/stynx-s15-ctg2-main-a2f-reference.log`.
18. O `main` avançou de novo com a troca do gate de PR por
    `verified-local-rc` (ADR-DEVAI-ADOPTION-0006). A CTG-0002 integrou
    esse delta no merge Architect `d88c92e6`; o conflito de política foi
    resolvido preservando os quatro recibos de `65f982a5` e o recibo
    upstream de `88a17ccf`. `pnpm ci:stynx` passou em
    `/private/tmp/stynx-s15-ctg2-main-8d7-ci.log`. DEVAI strict desde o
    head remoto de #278 apontou dois recibos ainda ausentes de
    `FORBID-CI-WITHOUT-ADR`: o upstream `207b73d0` e este merge
    `d88c92e6`. O PR upstream #281 prepara o primeiro; o segundo requer
    recibo Owner exato antes do push. Não atualizar #278 até ambos serem
    reconhecidos por DEVAI strict. O gate remoto agora também exige
    evidência assinada `verified-local-rc` para o head do PR.
19. OD-S15-02 substituiu o fluxo por CTG: CTGs 5–8 foram implementadas e
    importadas em ordem na branch cumulativa, sem PR/RC intermediário. CTG7
    recebeu PASS integrado em `22d976fb`; CTG8 recebeu PASS integrado em
    `0c7eb2e0`, seguido do hardening de palavras-chave PostgreSQL 16 em
    `b28be30b`. A tabela de conformidade preliminar entrou em `58d85187`.
    O próximo CI completo, apps de referência, PR, CI remoto e publicação
    final ocorrem somente após congelar o escopo e versionar a candidata.
20. Uma decisão Owner permanece pendente antes do congelamento: a adenda A1
    §8.1 do DETRAN confirmou SIG/OBX/OFS como MUST, enquanto OD-S15-02
    nomeou o encerramento após CTG8. A divergência do envelope 409 da CTG5
    foi corrigida sob classificação Architect opção A, com PASS de delivery
    do Opus: apenas código CTG5 ainda não publicado foi alinhado ao schema
    canônico existente, sem editar `law/` ou corpos legados. A autorização
    geral do Owner não é apresentada como escolha específica A/B; mudança de
    invariante ou fio publicado exige nova OD.
21. O hook pós-merge local aponta para um issuer DEVAI ausente em cada
    worktree. No checkout principal, a correção foi ensaiada com
    `pnpm exec devai init bind --host-adapter post-merge --as-role architect --write`
    seguida de `pnpm exec devai init bind --target . --adopter-policy law/policy/devai-adoption.json --as-role architect --write`;
    `devai doctor` ficou `ok:true` e o adapter foi validado. Para manter
    `main` limpo e não mudar sua política de host antes do PR, os quatro
    arquivos rastreados resultantes foram restaurados. A chave privada e o
    issuer permaneceram em `.git/devai/`. Reaplicar os dois binds no checkout
    principal imediatamente antes do merge local final, conferir `doctor`,
    executar o merge e então restaurar apenas as mudanças locais dos quatro
    arquivos se a branch final não os alterar. Não incluir o binding de host
    particular no PR sem nova revisão da autoridade remota.
22. A reconciliação do envelope CTG5 ocorre **somente** na worktree
    `/Users/aarusso/.codex/worktrees/ctg5-transaction/stynx`, branch
    `codex/ctg5-error-envelope`. O contrato Architect foi fixado em
    `29dfa65f`; o prompt-review vinculado por SHA-256 dos prompts Inspector
    105 e Engineer 106 retornou **PASS** no ciclo 4 em
    `reviews/ctg5-envelope-worker-prompt-review-4.json`, com binding em
    `379e933c`. O checkpoint anterior ao despacho Inspector é `cae8860a`.
    Os sensores Inspector, o rebind Architect de trace e a implementação
    Engineer foram commitados na worktree isolada; o último commit Engineer é
    `62dfb561`. `pnpm test:int` passou (52/52 tarefas), e o rebind gerado do
    baseline de API passou 44/44 e foi commitado em `949f83dc`. O
    delivery-review Opus retornou PASS no ciclo 1; este merge importa a
    correção na branch cumulativa, sem PR, RC ou CI integral intermediário.
    A decisão de escopo A1 §8.1 permanece pendente. O desvio de uma leitura
    `git show` pelo Inspector, sem mutação, foi comunicado ao maestro; Git
    continuará exclusivo do maestro.
23. A adenda A1 §8.1 recebeu prévia condicional de lacunas e paralelismo em
    `work/rounds/R-0002/ctg-0009-preflight.md`. SIG/OBX/OFS continuam fora da
    implementação cumulativa até a decisão exata do Owner sobre o escopo.
    Nenhum worker foi despachado para CTG9. Se incluída, a CTG9 segue a
    mesma importação cumulativa, sem PR ou RC intermediário; o único gate
    local/PR/remoto/publicação ocorre após todos os MUST confirmados.
24. Preflight read-only do gate consolidado em 2026-09-28: `origin/main` e
    `main` coincidem em `493fcd95` e são ancestrais da branch cumulativa;
    apenas o PR bot #273 está aberto. `pnpm release:preview` passou e mostrou
    cinco changesets de CTGs 4–8 pendentes, mas ainda projetou
    `1.5.0-rc.4` porque `.changeset/pre.json` permanece em `pre`. Não
    versionar nem executar o CI integral antes do congelamento do escopo:
    após as decisões Owner e a correção CTG5, usar `pnpm changeset pre exit`
    e `pnpm version-packages` para gerar a candidata estável, então executar
    o único gate integral da OD-S15-02. O estado detalhado está em
    `record.md` §Retomada consolidada.
25. A prévia condicional CTG9 foi revisada quatro vezes pelo Opus, todas com
    `REVIEW`, nos arquivos `reviews/ctg9-conditional-contract-review-{1,2,3,4}.json`.
    A ponte DETRAN gerou JSON válido nos ciclos 1 e 3; nos ciclos 2 e 4
    rejeitou cerca Markdown/JSON inválido e foi usado
    `claude -p --json-schema` com o mesmo prompt.
    O Architect incorporou no preflight os achados sobre autoridade Owner,
    assinatura, outbox, offline, precisão do cursor, sentinela inicial,
    réplica, locks de auditoria e transação top-level por item. Não há PASS
    de prompt-review de workers CTG9, e nenhum
    worker foi despachado. Os contratos continuam condicionados à decisão
    de escopo A1 e aos ADRs/aprovações humanas listados no preflight.
26. O delivery-review Opus do envelope CTG5 retornou PASS no ciclo 1 em
    `reviews/ctg5-envelope-delivery-review-1.json`, com recibo de hash pela
    ponte DETRAN. O maestro conferiu os autores e papéis dos commits. Antes
    da final, reparar a perda de observabilidade nos 500/503 convertidos:
    causa original, requestId e stack no log servidor, com sensor de corpo
    público inalterado. Esse achado foi não bloqueante para a importação.
27. Follow-up de observabilidade CTG5 antes da final: em toda rejeição própria
    5xx, o filtro HTTP registra `errorCode` e `requestId` com stack via Nest
    Logger. Quando a CTG5 converte falha de callback, setup, store, audit ou
    COMMIT em envelope fixo, `CommandRejectionResponse.cause` retém o valor
    original apenas no servidor. O corpo e os headers públicos continuam
    byte a byte no contrato canônico, sem causa nem stack. Primeiro, o
    Inspector prova 500 e 503 com logger e corpo HTTP exato; depois o
    Engineer implementa. Rebind de trace pelo Architect e delivery-review
    do follow-up precedem o único gate integral final.
28. O delivery-review do follow-up retornou PASS, mas apontou um caso limite
    a fechar antes da final: `String(cause)` pode lançar para um objeto sem
    protótipo ou com coerção hostil, interrompendo o filtro antes da resposta.
    O Inspector adiciona prova HTTP de callback que lança esse valor, com
    corpo/header exatos e log com `errorCode`/`requestId`; o Engineer torna
    a formatação e emissão do log incapazes de substituir a resposta.
29. O caso opaco foi corrigido no commit Engineer `d6bd8138` após sensor
    Inspector vermelho `77588011` e rebind Architect `39ea92a7`. O backend
    passou 502/502 em 48 arquivos, e o delivery-review Opus deste delta
    retornou PASS em `reviews/ctg5-opaque-delivery-review-1.json`. A correção
    CTG5 e seu follow-up estão prontos para o gate consolidado. Permanece
    pendente a decisão de escopo A1 §8.1 antes de versionar a final.
30. A prévia condicional CTG9 recebeu `REVIEW` também nos ciclos 5 e 6.
    O ciclo 5 expôs o trigger auditado sem advisory e perda do marcador CLS;
    a prévia foi emendada em `6ca1c24b`. O ciclo 6 ainda aponta a cabeça da
    cadeia ordenada por `now()`/UUIDv4, regressão possível de
    `Database.tx` legado com contextos derivados e contenção SSE de `now()`
    no advisory. Não há PASS, contrato vinculante ou despacho CTG9.
    OD-S15-03 resolveu o escopo; fechar estes três bloqueios e voltar ao
    prompt-review antes de despachar.
31. Preflight read-only do gate final no HEAD `6c32fd60`: branch limpa,
    `origin/main` em `493fcd95`, apenas PR bot #273 aberto. A tabela §7 tem
    U1–U15 e seus 42 caminhos de teste completos existem. `pnpm api:coverage`
    passou com 135 paths/204 rotas, `pnpm api:contract` com 135 paths,
    `pnpm sdk:route-smoke` com 204 operações, `pnpm check:rls-smoke` passou
    e DEVAI doctor retornou `ok:true` com advisory conhecido do binding
    pós-merge da worktree. `pnpm release:preview` ainda projeta `rc.4` pelos
    cinco changesets porque o pre mode continua ativo; não houve escrita
    de versão nem CI integral. OD-S15-03 inclui os dez MUST da CTG9 antes
    do congelamento.
32. OD-S15-03, decisão Owner recebida em 2026-09-28: **incluir CTG9 e
    continuar**. SIG-01…04, OBX-01…02 e OFS-01…04 entram na STYNX 1.5.0;
    o único CI local/PR/CI remoto/publicação final da OD-S15-02 ocorre após
    a CTG9. RCs e PRs intermediários continuam dispensados. Próximo passo:
    resolver os achados técnicos do review 6, ADRs superadoras, prompt-review
    PASS, tríades e gates focais das três frentes. Não versionar ou publicar
    enquanto algum dos dez MUST estiver sem prova.
33. Review técnico Opus 7 (`reviews/ctg9-contract-review-7.json`) retornou
    REVIEW. Quatro bloqueios de contrato: RR pode ler cabeça audit antiga
    sob advisory; restrição proposta de `audit.write` rejeitaria o caller
    owner real; defeito legado não pode impedir upgrade; efeito de domínio
    OFS pode abrir segunda conexão e congelar o pool. A prévia foi ajustada
    para RC obrigatório nos writers, GUC local de uma cadeia por transação,
    classificação/âncora de época legada e modo ALS estrito apenas no item
    OFS. SSE recebe timeout de lock e preflight serializado por tenant.
    Prompt-review de fechamento e prompts Architect SIG/OBX/OFS preparados;
    nenhum worker CTG9 despachado ainda.
34. Prompt-review Opus de fechamento 1 (`reviews/ctg9-prompt-review-closure-1.json`)
    retornou REVIEW: os quatro bloqueios técnicos anteriores estão
    fechados, mas o prompt SIG permitia escrita Architect em `packages/`
    e citava contrato inexistente. Corrigido para `signature.md` e contrato
    de rodada, com ADR opcional. O delta também explicita docs audit/data,
    migração OBX sem redespacho, verificação por época, erro RR não
    retentável, selo SQL e índice dos ADRs sob lock do maestro. Pedir
    revisão focal do delta antes do despacho; ainda nenhum worker CTG9.
35. Prompt-review focal do delta
    (`reviews/ctg9-architect-prompt-delta-review-2.json`) retornou **PASS**
    para despacho Architect paralelo SIG/OBX/OFS, com três ajustes
    editoriais não bloqueantes incorporados. Os write sets são disjuntos;
    nenhum worker executa Git, e índices ADR/contratos ficam com o maestro.
    Inspector e Engineer seguem dependentes de contratos aceitos e prompts
    próprios revisados.
36. Após PASS, os Architects SIG, OBX e OFS foram despachados em paralelo
    nos write sets exclusivos dos prompts 137–139. `ctg9_sig_architect` e
    `ctg9_obx_architect` são workers Sol 6; o worker de análise OFS
    `ctg8_consumer_sensor` foi retomado com o prompt 139. Nenhum worker
    executa Git. O maestro aguarda os três contratos/ADRs, faz o índice
    serialmente, revisa e commita em papel Architect antes dos sensores.
37. Os três workers Architect entregaram contratos e docs sem Git:
    `ctg9-sig-contract.md`/`signature.md`/ADR proposta de confiança;
    `ctg9-obx-contract.md`/docs outbox, audit e CTG5/ADR superadora;
    `ctg9-ofs-contract.md`/`offline-sync-api.md`/ADR superadora. A porta
    OBX admite append genérico dentro do CTG5 sem selo; o item OFS estrito
    sela a transação após append, preservando auditoria/idempotência do
    envelope. O maestro atualizou o índice ADR das decisões aceitas OBX/OFS
    e pediu delivery-review Opus dos contratos. Ainda não há Inspector.
38. Os contratos SIG/OBX/OFS da CTG9 foram commitados pelo Architect em
    `065b2dd1`. O primeiro delivery-review Opus dos contratos retornou
    **REVIEW** em `reviews/ctg9-architect-delivery-review-1.json`, com três
    bloqueios e correções menores. A ponte DETRAN rejeitou apenas o formato
    cercado em Markdown; `claude -p` com o mesmo prompt e schema produziu o
    veredito estruturado. Architects reativados para reparar contratos;
    depois rever o delta, obter PASS e só então revisar os prompts Inspector
    144–146. Nenhuma implementação CTG9, PR ou publicação foi iniciada.
39. O delta de contratos em `d3347c43` recebeu delivery-review Opus ciclo 2
    **REVIEW** em `reviews/ctg9-architect-delta-delivery-review-2.json` pela
    ponte DETRAN. Os bloqueios do ciclo 1 foram fechados; restou um ciclo de
    deadlock entre cutover OBX e append/enqueue por ordem de locks. Architects
    receberam reparos disjuntos do bloqueio e das observações de compatibilidade
    SIG/OFS. Corrigir preflight, obter delta PASS e só então prompt-review
    Inspector. Nenhum código de produto CTG9 foi alterado.
40. O delta de lock order em `1df59635` recebeu delivery-review Opus ciclo 3
    **PASS** em `reviews/ctg9-architect-lock-delta-review-3.json` pela ponte
    DETRAN, liberando o prompt-review Inspector. Quatro observações OBX não
    bloqueantes (trigger de audit habilitado pelo adotante, retry de falha de
    dispatch sob lock, `now()` ambiente e fila de três partes) seguem em
    fechamento contratual e sensores antes do despacho. Nenhum código de
    produto CTG9 foi alterado.
41. Prompt-review Inspector ciclo 1 retornou **REVIEW** em
    `reviews/ctg9-inspector-prompt-review-1.json`: sensores CTG5/audit sem
    package home e PKI/health sem dependências resolvíveis. O Engineer
    provisionou dependências runtime de signature, lockfile, README gerado e
    aliases Vitest em `c21ba672`; testes signature 22/22, typecheck,
    `lint:deps` e `lint:cycles` passaram. Architect ampliou write set OBX
    para backend/audit test e fechou os negativos; pedir prompt-review
    focal antes de qualquer Inspector. O provisionamento não implementa
    os dez requisitos da CTG9.
42. Prompt-review Inspector ciclo 2 retornou **REVIEW** em
    `reviews/ctg9-inspector-prompt-review-2.json`: os dois bloqueios
    anteriores foram fechados, porém um oráculo de lock A/B/C exigia
    55P03 sem UPDATE detido. O Architect OBX corrigiu os contratos e o
    prompt 145 separou fila com UPDATE enfileirado de UPDATE já detido.
    Prompt 146 ganhou cancelamento e leitura de recibos; Engineer registrou
    changeset de dependência signature e `workspace:*` em `c67774f9`.
    Pedir prompt-review focal 3 antes do despacho; ainda sem Inspector.
43. A ponte DETRAN rejeitou o formato da resposta do prompt-review focal 3
    (frase antes do JSON), sem veredito estruturado de ponte. O fallback
    `claude -p` com o mesmo prompt/modelo e schema retornou **PASS** em
    `reviews/ctg9-inspector-prompt-review-3.json`, liberando os três
    Inspectors em paralelo. A única observação não bloqueante, ordem do
    retry no ramo 55P03 da fila A/B/C, foi incorporada ao contrato e ao
    prompt antes do despacho. Os sensores continuam pendentes de escrita.
44. Três Inspectors foram despachados em write sets disjuntos após o PASS.
    Os sensores OFS detectaram conflito de semântica publicado E6 versus
    A1 para dedup por hash e segundo cancelamento. O Architect fixou modo
    CTG9 na configuração de `OfflineSyncPolicyResolver`, mantendo testes
    E6 sem resolver. O Inspector OFS foi orientado a prover resolver nos
    sensores novos; contratos e prompts alterados aguardam review focal
    155 antes de Engineer. SIG e OBX seguem independentes em testes.
45. CTG9 SIG: segundo FAIL de delivery foi reparado em fonte por Engineer
    e em sensores pelo Inspector `02c568a0`; o pacote signature passou
    180/180, typecheck e lint. Prompt 167 está em delivery-review ciclo 3;
    fonte sem commit até PASS. OBX: fallback estruturado do review ciclo 2
    deu PASS apenas ao snapshot móvel, e os ramos posteriores carecem de
    sensor/review em bytes congelados. OFS: Engineer informou reparos para
    os oito bloqueios do review 1 e gates focais verdes; Inspector ampliou
    corridas antes do prompt 168/review 2. Nenhum CTG9 foi declarado
    conforme, nenhum PR/RC/final novo foi aberto ou publicado.
46. Reviews CTG9 após os sensores adicionais: SIG ciclo 3 FAIL e ciclo 4
    FAIL restrito ao parser de xref/trailer; Engineer e Inspector repetem
    os negativos. OBX ciclo 3 PASS estruturado, mas a fonte recebeu delta
    de redaction/timeout e exige review 4 em bytes congelados; sensores
    reais pós-envio/marker foram acrescentados. OFS ciclo 2 FAIL por
    preflight e numeração; Architect fixou modo CTG9 versus E6, e
    prompt-review focal 172 está em curso. Documentação de migração
    CTG9 está em rascunho. Os dez MUST ainda não têm conformidade nem
    versão final publicada. Preservar a regra de um só CI local/PR/CI
    remoto/publicação ao término da CTG9.
47. CTG9 em 2026-09-28: OBX delivery-review ciclo 4 PASS, fonte no commit
    `6514af6d`; dois sensores PostgreSQL de corrida cutover/ACK no commit
    `4802ba34`. SIG delivery-review ciclo 5 FAIL com contraexemplo de
    catálogo DSS visto no parser linear mas omitido do xref; negativos e
    sensor DDL/RLS OFS no commit Inspector `be31f6b5`, SIG 201/201 e
    review ciclo 6 em curso sobre fonte reparada ainda sem commit. OFS
    prompt-review focal 172 FAIL por `sensor-error` e `policy-issue`;
    contrato de numeração e recibo foi fechado pelo Architect, Inspector
    corrige sensores e Engineer alinha fonte. Nenhuma conformidade CTG9,
    PR final ou publicação foi declarada.
48. Owner confirmou a inclusão da CTG9 e a continuidade até a publicação
    final. SIG delivery-review ciclo 6 PASS e OBX ciclo 4 PASS. OFS ciclo 4
    `REVIEW` por duas provas PostgreSQL insuficientes de fencing e submissão
    simultânea; o veredito não identificou defeito de fonte que bloqueie os
    quatro MUST, mas registrou correções adicionais. Architect decidiu a
    semântica de replay com chave de transporte diferente, contagem de
    `duplicateItems`, configuração de eventPort antes da escrita e ID da
    requisição atual no contrato OFS. Inspector e Engineer corrigem arquivos
    disjuntos em paralelo. Há prompt-review focal 186 para esse delta.
49. A política Architect da candidata estável `1.5.0` foi commitada em
    `1a0d7a9a`; o prompt-review da rota final teve PASS no ciclo 4. O
    Inspector final escreve sensores de scripts, sem versão ou publicação
    ainda. O rebind de API escreveu `public-api-baselines.json` sobre a
    fonte OFS congelada; confirmar novamente após qualquer mudança pública.
    A única publicação planejada permanece `1.5.0` após CTG9, CI local,
    PR único, CI remoto e recibo vinculado ao SHA exato.
50. Prompt-review focal OFS 186 pela ponte falhou em formatação JSON; a
    saída revelou contraexemplo real de `payloadJson` alterado em retomada
    com outra chave. O fallback estruturado do mesmo prompt retornou
    `REVIEW`: requestId opcional em 503, chave K2 de replay não vinculada
    em PostgreSQL, eventPort sem validação bootstrap, contagem de
    `duplicateItems` pouco explícita e prompts desatualizados. Architect
    fixou digest do payload no contexto, ledger durável de todas as chaves
    aceitas, precedência 409/422, regra de duplicados e guards de bootstrap
    no contrato/prompts; Engineer e Inspector alinham fonte/migration e
    sensores disjuntos. Prompt-review focal 188 teve PASS via fallback
    estruturado após falha de formato da ponte; quatro notas não bloqueantes
    foram esclarecidas no contrato e enviadas ao Inspector. O
    classificador final Engineer está commitado em `f47b7687`, sensores
    Inspector em `dd7f6a77`; antes do marcador resta a versão RC3 real
    e baseline público OFS a rebinder. Nenhum PR/publicação final.
51. CTG9 OFS delivery-review ciclo 5 **PASS** pela ponte. Fonte/migration
    Engineer em `a2643be5`; sensores Inspector em `370cca1c` e
    `45d5471c`; 135/135 testes unitários, 34/34 integração do pacote,
    typecheck/lint e seis tabelas da migration com FORCE RLS. Trace
    Architect em `3f7174a0`, 471/471. OpenAPI gerado rebindado para
    142 caminhos e SDK gerado para as sete rotas novas; verificador de
    acrônimo Engineer `6ac9724f`, SDK `99cf8e33`, smoke 211/211.
    Baseline público foi refeito depois do SDK. O próximo passo é fechar
    o commit Architect de contratos/baselines/changeset/evidência, sair
    do pre mode e criar o marcador final; não há PR/RC adicional.

## Reviews, PRs e publicações

Três ciclos de prompt-review foram executados: REVIEW, REVIEW, PASS (terceiro
autorizado pelo Owner). Delivery-reviews: REVIEW nos ciclos 1–4; PASS nos
ciclos 5 e 6 (delta dos checks do PR). O PR #272 foi mesclado; RC e release
final não foram publicados. Publicar
qualquer RC ou a final exige recibo Owner por ação e SHA exato.

## Contrato de versionamento RC1

O pre mode `rc` deve produzir `1.5.0-rc.1` para a primeira candidata,
partindo do grupo fixo em `1.4.0` e do changeset minor de tenancy. O
versionador continua corrigindo a promoção major causada por peers
`workspace:*`, mas não pode descartar o sufixo `rc`. Todos os 44 pacotes
publicáveis, o manifesto raiz, o template e os CHANGELOGs devem concordar
com a mesma versão. A invocação repetida sem changeset novo não cria outra
RC. O estado de entrada é o `pre.json` de `pre enter rc`, com
`changesets: []`; arquivos `.md` consumidos permanecem no disco. Em modo
`pre`, somente IDs ausentes de `pre.json.changesets` são pendentes. O
Changesets gera `rc.0` na primeira execução, mas a decisão OD-S15-01
exige `rc.1`. Um changeset posterior patch/minor mantém a base 1.5.0 e
incrementa o ordinal; um major posterior falha fechado, aguardando OD
do Owner. Em modo `exit`, todos os changesets, consumidos ou novos,
compõem o maior bump a partir do `initialVersions` do grupo fixo: o
resultado sem sufixo é 1.5.0 neste caso. Estado estável sem `pre.json`
segue a regra existente. Drift significa membro do grupo fixo ausente
de `initialVersions` ou diferente do 1.4.0 unificado; tag atual diversa
de `pre.json.tag`; ou base prerelease diversa da base recalculada.
Entradas malformadas falham fechadas. Entradas privadas e externas em
`initialVersions` não compõem o grupo fixo.
Em `pre`, manifesto estável igual ao `initialVersion` do grupo exige
`pre.json.changesets` vazio; manifesto prerelease exige lista não vazia.
Cada ID consumido deve ter seu `.changeset/<id>.md` presente tanto em
`pre` quanto em `exit`. Em `exit`, a base recalculada deve igualar a base
do manifesto prerelease; um major novo que a mude falha fechado até OD
do Owner. `pre.json` inválido (modo desconhecido, tag ausente/não string,
`initialVersions` ausente/não objeto, `changesets` não array ou JSON
inválido) falha fechado; se o arquivo não existir, aplica-se sem
alteração o fluxo estável.

Uma versão prerelease só pode ser publicada com dist-tag `rc`, obtida de
`pre.json.tag`; `latest` deve ser recusado para prerelease. O script atual
`scripts/publish-release-plan.mjs` fixa `--tag latest` e o candidate
`1.4.0`; portanto publicação permanece bloqueada até triade própria
reparar a rota, incluir sensor Inspector e obter delivery-review. O
pedido de recibo Owner citará `--tag rc`, comando e SHA exatos.

Tríade focal: Architect fixa este contrato e os prompts; reviewer Opus
5.5 faz prompt-review antes do despacho; Inspector escreve sensores de
plano e reescrita de CHANGELOG no fixture de versão; Engineer ajusta
`scripts/lib/fixed-group-version.mjs` e `scripts/version-packages.mjs`
até o red/green. Architect rebinda `law/trace.json` se necessário.
O Engineer roda somente testes focais e `pnpm release:preview` contra
`pre.json` reposto, sem executar versionamento real. Após green, o maestro
executa `pnpm version-packages`; Inspector rebinda os três SHA-256 exatos
em `test/scripts/local-rc-blocker-contract.test.mjs` que congelam o
manifesto raiz, e Architect rebinda `law/trace.json` após edições de
testes. O fluxo estável já testado permanece válido. Nenhum workflow será
editado. A preparação, CI e revisão de entrega da RC ocorrerão antes da
solicitação de recibo para publicar.

Prompt-review excepcional ciclo 3: **PASS**. As observações de execução
ficam vinculantes para a tríade: em `exit`, IDs já consumidos ainda
ativam a versão final; após `changeset version`, validar versão gerada
(tag/ordinal em `pre`, versão estável em `exit`) e conferir que
`pre.json.changesets` ganhou exatamente os IDs pendentes antes de
reescrever manifestos. A correção do primeiro `rc.0` para `rc.1` também
se aplica se não houver promoção major de peers.

## Contrato da rota de publicação RC1

Após gerar e revisar o candidato `1.5.0-rc.1`, rebinder a política
Architect `law/policy/registry-version-anomalies.json` à OD-S15-01:
`next_unified_version` e `anomalies[0].allowed_candidate` exatos para
`1.5.0-rc.1`, mantendo pacote, versão 2.0.0, version ID, evidências,
`allowed_effects` e o escopo singular da exceção. A decisão registra
data 2026-09-26, baseline merge
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`, tree
`d5f28e558de386713b3573646ff71f58e37c2b65`, supersede a decisão
de 2026-09-15 para 1.4.0, e declara que `latest` permanece em 1.4.0
durante a RC; a condição de fechamento da candidata RC exige `rc` →
`1.5.0-rc.1` e `latest` → 1.4.0. O digest fixado em
`scripts/lib/registry-version-policy.mjs` acompanha exatamente os bytes
da política, por Engineer em commit separado de `law/`.

O candidato publicado deve ser o mesmo em todos os 44 manifestos,
política, plano de publicação, checagem de monotonicidade e recibos.
A política Architect fixa `preflight_latest_version: "1.4.0"`; o
loader confere esse campo contra
`registryVersionPolicyConstants.preflightLatestVersion`. O publisher
consome a constante, sem outro literal de versão. O commit Architect
da política tem digest temporariamente divergente e **não** é
candidato nem será enviado isoladamente; o Engineer rebinda o digest
em commit próprio. Só o HEAD combinado, após sensores e trace, passa
por CI e pode ser enviado ao PR.
Para versão prerelease, a rota deriva a dist-tag exclusivamente de
`.changeset/pre.json` (`mode: pre`, `tag: rc`) e recusa ausência, tag
divergente, `latest` ou versão estável; `npm publish` recebe `--tag rc`.
Para versão final estável, após `pre exit` e versionamento, a rota
permite somente `latest` com `pre.json` ausente; sua presença em
qualquer modo com candidato estável falha fechada. No SHA candidato RC,
todos os 44 manifestos são 1.5.0-rc.1, `pre.json` está commitado em
`mode: pre`, `tag: rc`, e nenhum ID `.md` fica pendente fora de
`pre.json.changesets`; somente `verify-release-policy.mjs
--registry-monotonicity` e o preflight de publicação recusam
pendências. O `release:policy` padrão aceita changesets novos para
futuros CTGs/RCs. Assim, a candidata exata evita que changesets/action
escolha criar PR em vez de publicar. O plano e
os recibos incluem a dist-tag e o SHA/tree exatos; a verificação após
publicação exige que o pacote RC esteja em `rc` e que `latest` não tenha
sido movido. O preflight lê e registra o objeto completo de `dist-tags`
de cada pacote, permite chaves históricas válidas, mas exige `latest`
exatamente 1.4.0 nos 44 antes da primeira mutação; metadados ilegíveis
ou malformados são `PUBLICATION_DIST_TAG_UNKNOWN`. Após publicar, cada
chave anterior exceto `rc` permanece byte a byte igual e `rc` aponta à
candidata. Se a versão/`rc` ainda não estiver visível, a rota pode reler
até cinco vezes, com intervalo fixo de dois segundos, registrando
tentativas e resultados no recibo; alteração de `latest` ou outra tag
anterior é `PUBLICATION_DIST_TAG_DRIFT` imediata. O primeiro pacote é
`@stynx-nyx/angular`, canário do comportamento GitHub Packages. O
plano de publicação registra todas as suas dist-tags anteriores,
byte a byte, antes da primeira mutação;
se a registry mover `latest`, a publicação para imediatamente. Restaurar
`latest` seria nova mutação e exigiria recibo Owner próprio. Pré-flight
de registry desconhecido ou resultado ambíguo
falha fechado, preservando stop-on-first-failure e a regra de novo
recibo Owner para recuperação parcial. A exceção angular-profile@2.0.0
continua restrita ao único pacote/version ID.

O workflow `release.yml` permanece intocado: já usa
`--candidate-from-policy`, exige dispatch de `main` no SHA exato,
opt-in Owner e token. Inspector prova o candidato, a monotonicidade,
dist-tag e negativas em módulo puro sem efeitos colaterais
`scripts/lib/publication-dist-tag.mjs`, com
`selectPublicationDistTag({version,preState})`,
`buildNpmPublishArgs({tarball,registry,tag,version})`,
`verifyPostPublishDistTags({candidate,preflightLatest,preflightDistTags,distTags})` e
`assertNoPendingPreChangesets({preState,changesetIds})`. Erros tipados
`PUBLICATION_DIST_TAG_INVALID`, `PUBLICATION_DIST_TAG_UNKNOWN` e
`PUBLICATION_DIST_TAG_DRIFT`. O script de publicação usa essas funções;
testes nunca o importam, pois ele tem efeitos colaterais. Engineer
ajusta scripts de política e publicação. Architect rebinda
`law/trace.json` depois dos testes Inspector. Prompt-review Opus antes
do despacho, delivery-review e CI
antes do PR. Publicação só após merge, recibo Owner por ação/SHA e
disparo explícito com `publish:true`; o pedido citará dist-tag `rc`,
SHA/tree e que o primeiro pacote é canário. A RC não cria tag Git
`v1.5.0-rc.1`; a última tag estável publicada e alcançável é
`v1.3.1`, que resolve a `a46ecb88bf5796a8fa4d142c2daf8b52c25a549f`.
O resolver autenticado confirmou essa referência e o DEVAI strict
desde ela passou com zero findings antes do segundo delivery-review.

Prompt-review excepcional ciclo 3 da rota: **PASS**, com ajustes não
bloqueantes incorporados em prompts 15/16 e neste contrato antes do
rebind da política.

### Reparo do versionamento privado antes do marcador final

O primeiro `pnpm version-packages` após `pre exit` falhou no SBOM porque
Changesets modificou o fork privado `tools/image-size-safe`. A saída
parcial foi revertida; HEAD `5dffc830` mantém `pre.json` em `pre`.
Contrato focal em `final-release-context-contract.md`, prompts 189/190.
Prompt-review Opus ciclo 1 retornou **REVIEW**: faltava prova da ligação
do wrapper e rebind de trace. Os prompts agora exigem ligação, falha do
subprocesso, globs reais e preservação dos manifests privados congelados.
Após prompt-review PASS: Inspector escreve e commita sensores; Engineer
implementa e commita helper/wrapper; Architect executa
`pnpm check:trace --print`, rebinda `law/trace.json` e commita. Só então
repetir `pre exit`, `release:preview`, `version-packages` e verificar diff
sem manifests/CHANGELOGs privados antes do marcador final. Não há PR ou RC
intermediário.

### CI local final: triagem do lint CTG9

`sensor-error` — o primeiro `pnpm ci:stynx` após marcador local
`5e9e6018` parou em seis asserções de mera existência/ausência nos
sensores CTG9 (WAVE-05A/CW-1). O marcador foi retirado apenas da
branch local com `git reset --mixed HEAD^` e a árvore foi restaurada
ao pai `4baede04`, `pre.json mode=pre`, antes de qualquer PR/push.
Inspector fortalece as seis asserções nos cinco arquivos indicados em
prompt 192; Architect rebinda trace; Engineer regenera o marcador e
repete o CI integral. Nenhum teste é enfraquecido.

`sensor-error` — a segunda tentativa de CI, após marcador local
`3e4b709f`, passou por `lint:tests` e parou em `lint:deadcode`: Knip
não reconhecia `test/packages/cli-generator/consumer-runtime.ts`,
copiado dinamicamente pelo fixture externo da CTG8. O marcador foi
retirado localmente e a árvore restaurada ao pai. Engineer adicionou
a fixture como entrada explícita do workspace `test/*` em
`tools/repo-config/knip.config.ts` (`3a7a3825`); `pnpm lint:deadcode`
passou. Regenerar marcador e repetir CI integral.

`plant-bug` — preflight `pnpm lint:cycles` encontrou dois ciclos
reais em signature: verifier ↔ service pelo helper SHA-256 e
readiness ↔ module pelo registro de health. Engineer `04790342`
usa o digest comum e move o estado de witness para módulo interno,
preservando o export público. `pnpm lint:cycles`, signature 204/204,
lint, typecheck e typecheck do monorepo 73/73 passaram; `lint:deps`
e `lint:deadcode` também passaram. Regenerar marcador após estes
commits, sem alteração de baseline público esperada.

`reference-gap` — o CI após marcador local `1d927fa9` passou por
typecheck e parou em `api:baselines`: o refactor de signature emite
`health-witness.d.ts` e modifica `readiness.d.ts`, embora o barrel
público permaneça igual. O marcador foi retirado localmente;
Architect executou `pnpm api:baselines:write` e confirmou
`pnpm api:baselines` 44/44. O grafo de testes preflight revelou cinco
expectativas antigas de tenancy: `resolveAndValidate` retorna também
`checkedActorId` após validar membership. Inspector `7041e350`
amarrou o ator exato nos cinco casos; tenancy 85/85 passou, trace
472/472 não mudou pois as chamadas `expect` permaneceram nas linhas
originais. `pnpm install --frozen-lockfile` restaurou dependências sem
alterar arquivos rastreados. Regenerar marcador e repetir CI.

`sensor-error` — o quarto marcador local `c1959ce6` passou pelos gates
anteriores e revelou que o teste de falha de conexão da CTG5 usava
`new URL()` para um DSN PostgreSQL de socket Unix. Inspector `98388927`
usa uma porta TCP indisponível para provar 503 sem chamar o handler.

`plant-bug` — o audit trigger da CTG9 faz a reserva da chave aguardar
o advisory lock da cadeia. O `lock_timeout` de idempotência produzia
409 indevido antes do handler. Inspector `c372ee12` observa o bloqueio
real com uma segunda conexão PostgreSQL e exige 201 após mais de
`lockTimeoutMs`. Engineer `c96e832d` suspende esse timeout apenas ao
adquirir o advisory de auditoria e o restaura depois; a migration agora
declara RLS explicitamente para o linter. Os 16 testes focais,
`lint:migrations`, `lint:tests` e RLS negativo passaram. O marcador foi
retirado apenas localmente. Rebind de trace, regeneração do candidato
e novo CI integral são os próximos passos; nenhum PR/push/publicação
ocorreu.

`sensor-error` — o quinto marcador local `5cebcdac` passou por
472/472 trace, lint, typecheck, 506/506 testes backend e 135/135 testes
OFS, mas `test:int` parou em dois casos Redis da CTG3. A fixture fixava
`2026-09-27` enquanto o Redis real usa `EXPIREAT` absoluto e o relógio
real já era `2026-09-28`: a sessão de origem sumia imediatamente.
Inspector `e66515a1` ancora o relógio controlado 60 segundos à frente
do instante de execução, preservando o avanço de três segundos que
expira apenas o alvo. `pnpm --filter @stynx-nyx/sessions test:int` passou
14/14, lint de testes passou. O marcador foi retirado localmente;
Architect rebinda trace 30/30 e Engineer regenera o candidato antes
do novo CI integral. Nenhum PR/push/publicação ocorreu.

**Checkpoint final pré-PR (2026-09-28):** marker Engineer `b647f568`
para `1.5.0`/44 pacotes, `ci:stynx` integral e `ci:reference-apps`
verdes, release policy/provenance/consumer fixtures verdes, trace
472/472, RLS negativo sete tabelas, DEVAI forbidden strict zero achados
após recibo exato em `bfa5d2a9`. Delivery-review consolidado Opus 5.5
ciclo 1 **PASS** em `reviews/final-integrated-delivery-review-1.bridge.json`.
O ledger de §7/A1 usa 1.5.0 como versão candidata e deixa explícito
que o pin DETRAN só vale após publicação verificada. Antes do único PR,
preparar e publicar a evidência assinada `verified-local-rc` para o HEAD
final, cuja configuração de ferramenta/ambiente está fixada em
`law/policy/devai-local-rc-*`. Depois: PR, CI remoto, merge, SHA main,
recibo Owner exato e publicação final, sem nova RC.
