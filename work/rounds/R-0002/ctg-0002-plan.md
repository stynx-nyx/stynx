# CTG-0002 — SSE backend e cliente Angular

**Papel:** Architect. **Base:** merge CTG-0001
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`.
**Fonte:** DETRAN C-0002 rev.2 §4, §7, §8, HEAD somente leitura
`220a40202bf4ab17a5ce28b882ad96d60755842f`.
OD-S15-01 torna UPS-SSE-01…10, UPS-NGSSE-01…10 e UPS-TEST-01 todos
MUST para 1.5.0. A §8 não contém adendas; UPS-OBX-01 não integra este
CTG. Não copiar código do DETRAN.

## API confirmada e decisões de contrato

- `@stynx-nyx/core` expõe `RequestContext` e mutator, mas sua classe
  abstrata `Database` não declara `withRequestContext`. A classe
  concreta `@stynx-nyx/data` declara
  `Database.withRequestContext({tenantId,actorId,sessionId?}, fn)`.
  O backend SSE recebe uma porta estrutural de contexto com essa
  operação, com assinatura
  `withRequestContext<T>(scope: {tenantId:string; actorId:string;
sessionId?:string}, fn: () => Promise<T>): Promise<T>`; type test
  prova atribuição estrutural de data.Database. O teste de integração
  a liga ao Database de data. Não
  alegar que backend já depende de data nem usar AsyncLocalStorage
  herdado do timer.
- `@stynx-nyx/backend` não tem SSE/subpath hoje. O Architect fixa a
  superfície pública real antes dos sensores: serviço de fluxo
  utilizável num `@Get` manual, `EventStreamSource` plugável com
  `now(scope)`, `findById(id,scope)`, `listSince(cursor,scope,limit)` e
  cursor `(createdAt,id)`, além de porta de scheduler e opções de
  filtro/projeção/limite/métricas. Exportar pelo barrel raiz; subpath
  apenas se o baseline de API justificar.
  Fonte e escopo são genéricos (`TScope extends StynxSseScope`), para
  filtros por política descerem ao SQL. Falta de tenant retorna 400
  `SSE_TENANT_REQUIRED`; falta de ator retorna 401
  `SSE_ACTOR_REQUIRED`, ambos antes de headers ou SQL. Ordem de
  preflight: validar tenant/ator → cota 429 → resolver cursor/204 →
  flush dos headers e `: connected`. O `@Get` manual não passa por
  transformação/buffering de resposta; enviar `X-Accel-Buffering: no`
  e chamar `flushHeaders()` quando disponível. Métricas saem por
  sink injetável `EventStreamMetricsSink` (aberturas, frames, drops,
  fechamentos) e contadores consultáveis do serviço, sem noop silencioso.
- A outbox atual faz upsert por `(tenant_id,entity,entity_id)` e não é
  um log append/replay. A implementação padrão sobre outbox aguarda a
  adenda UPS-OBX; a fonte plugável é MUST agora.
- `provideStynxDefaults({})` sozinho não instala HttpClient e seus
  interceptores; o cliente Angular exige a configuração `angular` com
  authProvider para bearer, X-Tenant-Id e X-Request-Id. Nunca usar
  `EventSource` nativo. O transporte HTTP usa `observe: 'events'`,
  `reportProgress: true`, `responseType: 'text'` e parser incremental.
- `TenantContextService.tenantId()` e `tenantChanged$` são as fontes
  reais de tenant. Para evitar ciclo (`angular-auth` depende de
  `angular`), `provideStynxEventStream` exige `sessionActive:
Signal<boolean>` fornecido pela aplicação, que pode ligar
  `StynxSessionService.active` real; transição para falso é logout e
  interrompe o fluxo. É desvio de assinatura da proposta upstream.
  `@stynx-nyx/angular/testing` já é secondary entry exportada, porém
  vazia: `packages-web/angular/testing/index.ts` é a entrada canônica;
  `src/testing/index.ts` apenas reexporta a mesma superfície, sem
  duplicar implementação.
- O transporte SSE marca cada request com `HttpContextToken` próprio.
  `ErrorInterceptor` preserva `HttpErrorResponse`/headers e suprime
  `ErrorBannerService` para esse contexto; assim `Retry-After` de 429
  chega ao cliente. `AuthInterceptor` mantém refresh e replay de 401;
  só o 401 terminal após essa tentativa leva a `stopped`. Sensores
  usam a cadeia real de interceptores e provam cabeçalhos, refresh,
  ausência de banner e Retry-After.

## Critérios de prova

Backend: headers e `: connected`; frame `id/event/data` JSON com linha
vazia; `retry:` opcional; heartbeat padrão 20 s só por scheduler
injetável; contrato de ordem, at-least-once, dedup por ID e janela de
replay. Capturar tenant/ator na abertura e executar **toda** consulta
de fonte, inclusive cada tick, dentro de `withRequestContext`. Sem
tenant, erro antes de SQL. `Last-Event-ID` de evento visível recente
retoma; visível expirado (>24 h padrão) retorna 204 vazio; inexistente
ou de outro tenant invisível por RLS começa em `now()` do banco. Filtro
e projeção antecedem write. Ticks serializados, falha de leitura não
derruba conexão, close de request ou response libera agendamentos.
Limite opcional por tenant/ator devolve 429/Retry-After; payload acima
do máximo produz `: dropped <id>`; métricas de conexões/frames/drops.
Provar frame entregue sem buffering na cadeia real de Nest.

Angular: signals `idle/live/reconnecting/polling/stopped`, `status()`,
`polling()`, `lastEventId()`, `events$` tipado e `tick$` no polling;
backoff 1→30 s ou compasso fixo; 2 falhas/60 s levam a polling com
intervalo obrigatório por app; primeiro frame de retorno limpa contagem
e reabre live. Parser aceita fragmentos arbitrários, CRLF, comentários
e `data:` multilinha. Dedup por ID, 204 limpa cursor, stale 20 s×2,
401/403 para, 429 espera max(backoff, Retry-After), 0/5xx contam.
Troca de tenant fecha/reabre sem cursor; logout para. `types` e
`eventPrefix` filtram sem transformar payload em texto de apresentação.
Fake transport/clock publicado cobre frames, HTTP errors e close.

E2E MUST: Nest + PostgreSQL reais com RLS FORCE e papéis não superuser,
tenants A/B e eventos distintos. Abrir e executar tick como A;
nenhum evento B aparece. `Last-Event-ID` de B é desconhecido para A;
ID A recente retoma; ID A expirado retorna 204. Provar cada leitura
no escopo explícito e a limpeza após close. Usar `pnpm
check:rls-negative`, `pnpm test:int` e CI completo.
O E2E vive em `reference/api/test/integration/*.spec.ts`, host que já
tem backend, data, Nest HTTP, pg, supertest e `test:int` no grafo, sem
novo manifesto/lockfile. O fixture cria tabela no banco de teste com
ENABLE + FORCE RLS, owner diferente de `stynx_app`, política USING/WITH
CHECK; não muda `database/ddl`. A conexão de leitura usa `SET LOCAL ROLE
stynx_app` e afirma `current_user`, `rolsuper=false`,
`rolbypassrls=false`. `findById`/`listSince` não têm WHERE por tenant:
o isolamento vem da policy. A rota HTTP monta middleware/guard reais
do CTG-0001 e captura `RequestContext` real. O scheduler falso executa
ticks após limpar ALS ou sob tenant B, de modo que pular a porta
`withRequestContext` resulte em zero linhas/erro; incluir essa prova
negativa. Usar template PostgreSQL local quando disponível
(`STYNX_TEST_PG_TEMPLATE`) e as quatro variáveis `STYNX_TEST_PG_*` da
rodada; confirmar que `pnpm test:int` executou este E2E antes do
delivery-review. Sensor Angular reprova construção de
`globalThis.EventSource`.

## Tríade e locks

1. Architect: contrato de API público em
   `docs/framework/contracts/sse-1.5.md`, confirmado com código atual;
   prompt-review Opus 5.5 antes de qualquer worker Inspector/Engineer.
2. Inspector: sensores backend unitários sob `packages/backend/test/`
   e E2E RLS em `reference/api/test/integration/`; sensores Angular
   sob `packages-web/angular/test/`, com lock do Inspector em
   `packages-web/angular/vitest.config.ts` e `tsconfig.spec.json` só
   para resolver `@stynx-nyx/angular/testing` antes do alias raiz.
   Podem ser dois workers médios em
   paralelo porque não compartilham arquivos. Cada negativo deve
   falhar no produto atual, sem enfraquecer teste existente.
3. Engineer: implementação backend e Angular em blocos sem lock comum;
   backend não edita arquivos Angular e vice-versa. `angular/testing`
   fica no bloco Angular. Um único PR reúne o CTG após os dois blocos.

Depois de sensores: maestro Architect rebinda `law/trace.json` via
`pnpm check:trace --print`, em commit `DEVAI Architect`. Depois de API:
maestro Architect confirma e rebinda `pnpm api:baselines:write` para
backend raiz, angular e `stynx-nyx-angular-testing.d.ts`, em commit
Architect. Depois dos dois blocos, maestro Engineer cria **um**
changeset minor do grupo fixo e executa `pnpm package-readmes:write`
e `package-readmes:check`, commitando gerados como Engineer. Banco:
RLS negativo e `pnpm test:int`; `pnpm lint:deps` para metadata.
Antes de PR: `pnpm ci:stynx` verde e delivery-review
Opus 5.5 PASS. Registrar desvios e símbolos reais na conformidade.

## Retomada

Este contrato é preparatório, em worktree separada da candidata RC1.
Não despachar implementação até prompt-review PASS. O PR #272 já está
mesclado na base; o RC1 ainda não foi publicado nesta base.
`pnpm install --frozen-lockfile` passou; o CI base passou com exit 0
no commit Architect `375d3a83` sobre o merge CTG-0001, usando
PostgreSQL em `127.0.0.1:55432`: trace 393/393, testes 97/97,
integração 51/51, build 48/48 e doctor verde. Log:
`/private/tmp/stynx-s15-ctg2-baseline-ci.log`.

Prompt-review ciclo 1: REVIEW. Contrato e locks reparados antes do
segundo ciclo; nenhum worker de implementação foi despachado.
