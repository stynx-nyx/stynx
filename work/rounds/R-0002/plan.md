# R-0002 — plano e checkpoint da STYNX 1.5.0

**Papel atual:** Architect. **Estado:** bootstrap e CI local verdes;
delivery-review do CTG-0001 escalado após segundo REVIEW.
**Worktree:**
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`, branch
`feat/release-1-5-0`.

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

Cada CTG segue Architect → Inspector → Engineer, com review de prompt antes do
despacho, review de entrega, CI verde e um PR. Ordem topológica:

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
9. candidatas SIG/OBX/OFS: só se confirmadas por adenda da §8.

Contratos de API, testes, baselines, trace, changesets, package READMEs,
RLS, integração e conformance serão detalhados por CTG e revistos antes do
despacho correspondente. Sem shim nem código copiado do DETRAN.

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

## Triagem

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
3. O CTG-0001 passou CI completo até `086c3f7c`, com trace 393/393,
   PostgreSQL/RLS reais, baseline API 44/44 e delivery-review Opus 5.5 ciclo
   3 em REVIEW. O reparo focal anterior distinguiu credenciais de falhas de
   infraestrutura, mas a revisão identificou três bloqueios remanescentes:
   ordem de interceptors no teste, JWKS vazio e provas HTTP/JOSE faltantes.
   Fazer nova tríade focal e obter PASS antes de PR e merge.
4. Conferir de novo a §8 da especificação antes de congelar o escopo.
5. `pnpm release:preview` confirmou 1.4.0 → 1.5.0 pelo versionador do grupo
   fixo. O último CI completo verde refere-se a `086c3f7c`, antes da nova
   rodada de sensores e do reparo focal exigido pelo terceiro review.

## Reviews, PRs e publicações

Três ciclos de prompt-review foram executados: REVIEW, REVIEW, PASS (terceiro
autorizado pelo Owner). Três delivery-reviews retornaram REVIEW. Nenhum PR,
merge, RC ou release final foi iniciado. Publicar
qualquer RC ou a final exige recibo Owner por ação e SHA exato.
