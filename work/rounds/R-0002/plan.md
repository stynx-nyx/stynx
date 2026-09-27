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

- RC2 delivery-review Opus ciclo 1: `policy-issue` — a política de anomalia e o publicador ainda fixavam `rc.1` apesar dos 44 manifestos em `rc.2`; Inspector acrescentou prova vermelha de igualdade e da transição `rc.1 → rc.2`, Architect vincula a decisão Owner existente à candidata exata, Engineer atualiza o candidato e o digest; repetir gates e review antes do PR.
- RC2 `release:status`: `policy-issue` — o primeiro commit de versão tinha assunto fora do marcador canônico; o maestro reconstruiu a sequência local sem mudar a árvore e o gate passou com `chore(repo): version 1.5.0 release candidate`.

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
