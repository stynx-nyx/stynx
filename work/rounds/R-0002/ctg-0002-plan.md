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
  operação; o teste de integração a liga ao Database de data. Não
  alegar que backend já depende de data nem usar AsyncLocalStorage
  herdado do timer.
- `@stynx-nyx/backend` não tem SSE/subpath hoje. O Architect fixa a
  superfície pública real antes dos sensores: serviço de fluxo
  utilizável num `@Get` manual, `EventStreamSource` plugável com
  `now(scope)`, `findById(id,scope)`, `listSince(cursor,scope,limit)` e
  cursor `(createdAt,id)`, além de porta de scheduler e opções de
  filtro/projeção/limite/métricas. Exportar pelo barrel raiz; subpath
  apenas se o baseline de API justificar.
- A outbox atual faz upsert por `(tenant_id,entity,entity_id)` e não é
  um log append/replay. A implementação padrão sobre outbox aguarda a
  adenda UPS-OBX; a fonte plugável é MUST agora.
- `provideStynxDefaults({})` sozinho não instala HttpClient e seus
  interceptores; o cliente Angular exige a configuração `angular` com
  authProvider para bearer, X-Tenant-Id e X-Request-Id. Nunca usar
  `EventSource` nativo. O transporte HTTP usa `observe: 'events'`,
  `reportProgress: true`, `responseType: 'text'` e parser incremental.
- `TenantContextService.tenantId()` e `tenantChanged$` são as fontes
  reais de tenant. `StynxSessionService.active`/`active$` representam
  estado de sessão; logout é transição para inativo, não evento próprio.
  `@stynx-nyx/angular/testing` já é secondary entry exportada, porém
  vazia; preenchê-la com fake transport/clock publicado.

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

## Tríade e locks

1. Architect: contrato de API público em
   `docs/framework/contracts/sse-1.5.md`, confirmado com código atual;
   prompt-review Opus 5.5 antes de qualquer worker Inspector/Engineer.
2. Inspector: sensores backend sob `packages/backend/test/` e E2E RLS
   em arquivo de integração próprio; sensores Angular sob
   `packages-web/angular/test/`. Podem ser dois workers médios em
   paralelo porque não compartilham arquivos. Cada negativo deve
   falhar no produto atual, sem enfraquecer teste existente.
3. Engineer: implementação backend e Angular em blocos sem lock comum;
   backend não edita arquivos Angular e vice-versa. `angular/testing`
   fica no bloco Angular. Um único PR reúne o CTG após os dois blocos.

Depois de sensores: Architect rebinda `law/trace.json` via
`pnpm check:trace --print`. Depois de API: Architect confirma
`pnpm api:baselines:write`. Engineer acrescenta changeset do grupo
fixo e executa `pnpm package-readmes:write`. Banco: RLS negativo,
`pnpm test:int`. Antes de PR: `pnpm ci:stynx` verde e delivery-review
Opus 5.5 PASS. Registrar desvios e símbolos reais na conformidade.

## Retomada

Este contrato é preparatório, em worktree separada da candidata RC1.
Não despachar implementação até prompt-review PASS. O PR #272 já está
mesclado na base; o RC1 ainda não foi publicado nesta base.
