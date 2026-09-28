# CTG-0005 — proposta Architect para conciliar rejeições HTTP com `law/`

**Papel:** Architect. **Estado:** proposta isolada; decisão do Owner pendente.
**Base:** branch cumulativa `81681892696c19979c7983ebff0fb1c0c3c49c8d`.
**Autoridades:** `law/schemas/error-envelope.schema.json`, `INV-ERROR-001`,
DETRAN C-0002 §6.2 UPS-TXN-03 e OD-S15-01/02. O delivery-review integrado
`reviews/ctg7-integrated-delivery-review-1.json` considera a divergência
bloqueante para a publicação final e recomenda esta opção A. Esta proposta
não autoriza mudar o fio: `INV-ERROR-001.change_policy` requer aprovação humana.

**Revisão técnica:** a ponte DETRAN foi usada duas vezes, mas ambas as saídas
texto falharam na validação de JSON (aspas não escapadas e cerca Markdown),
sem recibo PASS. O fallback `claude -p` com o mesmo prompt e schema de saída
gerou `reviews/ctg5-error-envelope-option-a-review-fallback.json` com
`REVIEW` e oito achados. Esta revisão do plano cobre esses achados; nenhum
Inspector ou Engineer foi despachado nesta proposta. Uma nova revisão válida
e PASS continua necessária antes do despacho, além da decisão do Owner.

## Decisão a registrar

Se o Owner aprovar a opção A, **todas as rejeições geradas pela nova fronteira
transacional**, inclusive os dois 409, passam ao envelope canônico. O
`mismatchCode` continua configurável como `string`, mas
deve obedecer ao padrão `errorCode` do schema. O valor padrão passa a
`IDEMPOTENCY:CONFLICT:duplicate-key`, já enumerado em
`docs/framework/contracts/errors.json`; a contenção usa
`IDEMPOTENCY:CONFLICT:in-progress`. Não alterar o 422 legado nem a serialização
das respostas escolhidas pelo consumidor, inclusive o 502 persistido.

O corpo exato do conflito de fingerprint é
`{ statusCode: 409, errorCode: <mismatchCode>, message: 'Idempotency key was used for a different request', requestId: <core RequestContext.requestId>, details: { key: <supplied key> }, retryable: false }`.
O corpo da reserva ainda em progresso troca apenas `errorCode` para
`IDEMPOTENCY:CONFLICT:in-progress`, `message` para
`'Idempotency key is in progress'` e `retryable` para `true`: o mesmo pedido
com a mesma chave pode virar replay após o vencedor commitar. Não incluir
`code` ou `context`, nem
propriedades adicionais. O `X-Request-Id` da resposta deve ser igual ao campo
do corpo. O filtro de rejeição resolve esse ID como o filtro IFM: contexto
core ativo, cabeçalho de resposta normalizado, cabeçalho de entrada
normalizado, ou novo UUIDv7, nessa ordem. Nunca ecoa cabeçalho bruto nem ID de
uma transação anterior. Essa resolução cobre contexto ausente e
`CommandModuleRequiredInterceptor`. O 409 nunca pode persistir chave,
auditoria ou domínio.

As demais rejeições **novas** da CTG5 não são legado. Todas usam o mesmo
construtor/filtro canônico, com mensagem pública fixa, `retryable:false` por
padrão e sem `details` salvo se explicitamente descrito no catálogo. O 409 em
progresso e o 503 de dependência são explicitamente `retryable:true`:

| Código atual                             | Status | `errorCode` proposto                                  | Prova Inspector                                   |
| ---------------------------------------- | -----: | ----------------------------------------------------- | ------------------------------------------------- |
| `TRANSACTIONAL_COMMAND_MODULE_REQUIRED`  |    503 | `COMMAND:UNAVAILABLE:module-required`                 | no-module, com/sem core                           |
| `TRANSACTIONAL_COMMAND_MARKING_REQUIRED` |    500 | `COMMAND:CONFIGURATION:marking-required`              | bootstrap + defensivo unitário                    |
| `COMMAND_CONTEXT_MISSING`                |    403 | `COMMAND:FORBIDDEN:context-missing`                   | errors HTTP sem contexto                          |
| `COMMAND_ACTOR_OR_TENANT_MISSING`        |    403 | `COMMAND:FORBIDDEN:actor-or-tenant-missing`           | errors HTTP com contexto incompleto               |
| `COMMAND_SCOPE_INVALID`                  |    400 | `COMMAND:BAD_REQUEST:scope-invalid`                   | provenance + errors HTTP                          |
| `IDEMPOTENCY_KEY_REQUIRED`               |    400 | `IDEMPOTENCY:BAD_REQUEST:key-required`                | errors HTTP sem header                            |
| `COMMAND_LOCK_TIMEOUT_INVALID`           |    500 | `COMMAND:CONFIGURATION:lock-timeout-invalid`          | bootstrap módulo/rota; runtime defensivo unitário |
| `COMMAND_IDEMPOTENCY_TTL_INVALID`        |    500 | `COMMAND:CONFIGURATION:ttl-invalid`                   | bootstrap metadata; runtime defensivo unitário    |
| `COMMAND_BODY_INVALID`                   |    400 | `COMMAND:BAD_REQUEST:body-invalid`                    | errors HTTP com corpo inválido                    |
| `COMMAND_TENANT_PROVENANCE_INVALID`      |    403 | `COMMAND:FORBIDDEN:tenant-provenance-invalid`         | provenance HTTP                                   |
| `COMMAND_ACTOR_PROVENANCE_INVALID`       |    403 | `COMMAND:FORBIDDEN:actor-provenance-invalid`          | provenance HTTP                                   |
| `COMMAND_CLAIMS_MISMATCH`                |    403 | `COMMAND:FORBIDDEN:claims-mismatch`                   | provenance HTTP                                   |
| `IDEMPOTENCY_KEY_IN_PROGRESS`            |    409 | `IDEMPOTENCY:CONFLICT:in-progress` (`retryable:true`) | faults HTTP concorrente                           |
| `IDEMPOTENCY_KEY_CONFLICT` (padrão)      |    409 | `IDEMPOTENCY:CONFLICT:duplicate-key`                  | advanced + Angular HTTP                           |

As provas `errors HTTP` entram em
`packages/backend/test/integration/transactional-command-errors.integration.spec.ts`;
os defensivos entram no unitário do contrato. `mismatchCode` inválido é uma
falha **só de bootstrap**; não há 500 de
requisição para ele. `lockTimeoutMs` estático (módulo/rota) e `ttlMs` da
metadata `@Idempotent` também são recusados no bootstrap, eliminando os 500
dessas duas linhas quando a rota está corretamente registrada. As linhas
permanecem inventariadas acima como comportamento atual a substituir, não
como contrato futuro. Os 500 de marcação inválida também devem ser recusados
no bootstrap, preservando a checagem defensiva em runtime. O 503 sem módulo
precisa de sensor Nest real para provar
que o filtro da rota ainda é alcançável. Se a montagem sem provider impedir
isso, o Engineer devolve `reference-gap` ao Architect antes de alterar o
contrato, sem emitir uma exceção crua e chamar o gate de verde.

### Outros caminhos da fronteira

| Origem CTG5                                                  | Contrato proposto                                                                                     | Sensor                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------- |
| Execução fora de HTTP                                        | Erro de programação antes de haver resposta HTTP; não é envelope de endpoint                          | unitário do interceptor           |
| `scope()` lança                                              | rollback/nenhum SQL, 500 `COMMAND:CONFIGURATION:scope-callback-failed`                                | Nest HTTP com callback que lança  |
| status HTTP inválido ou `persistStatus()` não booleano/lança | rollback, 500 `COMMAND:CONFIGURATION:status-invalid` ou `COMMAND:CONFIGURATION:status-policy-invalid` | HTTP + ausência de efeito durável |
| `encodeBody` não serializa JSON                              | rollback, 500 `COMMAND:CONFIGURATION:response-not-json`                                               | HTTP + ausência de efeito durável |
| `Database.tx(requireActor)` recusa identidade ou ator        | rollback, 403 `COMMAND:FORBIDDEN:transaction-identity-mismatch` ou `COMMAND:FORBIDDEN:actor-missing`  | wrong-role e actorless HTTP       |
| Store, audit sink ou commit falha                            | rollback, 503 `COMMAND:DEPENDENCY:transaction-failed`, sem expor SQL/segredos; `retryable:true`       | fault HTTP com injeção de falha   |
| Exceção própria do handler não selecionada                   | rollback; exceção continua sob o contrato HTTP do consumidor, sem mascarar por CTG5                   | teste existente de rollback/502   |

O Engineer deve distinguir erro originado pela fronteira de erro originado
pelo handler para não reescrever um `HttpException` do consumidor. Converter
erros CTG5 **após** rollback, não dentro da transação abortada. O filtro
global preexistente continua com sua forma histórica para exceções externas
e endpoints não marcados; registrar essa dívida em `errors.json`, sem
declarar que os erros próprios novos da CTG5 são legados.

Validar o `mismatchCode` de `forRoot` imediatamente e o de cada rota marcada
em `onApplicationBootstrap`, antes de servir tráfego. Recusar valor vazio,
caracteres fora do padrão do schema e código com domínio/categoria/detalhe
ausente. Não converter um código inválido silenciosamente. O valor padrão e o
código de contenção devem passar no mesmo padrão. A validação de bootstrap
substitui a rejeição tardia por requisição para esta opção. O Inspector move
`/invalid-option` da fixture de proveniência para um teste isolado de
`app.init()` que recusa o módulo antes de `listen`; altera o código custom
`SCOPED_COMMAND_MISMATCH` da fixture avançada para
`SCOPED:CONFLICT:command-mismatch` e preserva a prova de configurabilidade.
Isso migra as fixtures para o novo contrato, sem apagar negativos. Preservar
a validação dos demais callbacks/opções da CTG5. O padrão do runtime deve ter
um sensor que o compare ao padrão lido do schema, para detectar deriva.

O escopo é **cada rejeição própria produzida por CTG5**, inclusive os caminhos
fora de `reject()` classificados acima. O filtro global `StynxErrorFilter` e os erros realmente
preexistentes já usam formas diferentes, fato descrito em
`docs/framework/contracts/errors.json`; não migrá-los incidentalmente nesta
tríade. `CommittedCommandError` carrega corpo escolhido pelo consumidor e
exige o contrato de erro da rota, sem reescrita pela fronteira transacional.
Documentar esses limites e os modos observáveis em `errors.json` e na nota de
migração.

## Tríade e locks

1. **Architect:** depois da aprovação Owner e do prompt-review independente
   PASS, emendar **todas** as referências antigas no
   `docs/framework/contracts/transactional-audit-idempotency-1.5.md`, o
   `docs/framework/contracts/errors.json` (códigos/status/retryable,
   `runtimeBody`, divergência do filtro global),
   `docs/meta/migration/stynx-1.5-transactional-commands.md` e a linha U5
   de `work/rounds/R-0002/conformance-1.5.0.md`. A nota deve explicar ao
   DETRAN a mudança `code` → `errorCode` e a restrição de `mismatchCode`;
   `duplicate-key` cobre divergência de corpo, método ou caminho concreto.
   Após o commit Inspector, rebind de `law/trace.json` em commit Architect.
   Após o commit Engineer, confirmar o diff de `.d.ts` e executar
   `pnpm api:baselines:write` em outro commit Architect: a injeção opcional
   de RequestContext no filtro exportado provavelmente muda o baseline.
   Não editar o schema de `law/` nesta opção. Os três commits Architect são
   distintos e usam a identidade `DEVAI Architect`.
2. **Inspector:** atualizar e fortalecer as provas 409 e demais rejeições em
   `packages/backend/test/integration/transactional-command-http.spec.ts`,
   `transactional-command-advanced.integration.spec.ts`,
   `transactional-command-faults.integration.spec.ts` e
   `angular-transactional-command-http.spec.ts`,
   `transactional-command-provenance.integration.spec.ts`,
   `transactional-command-filters.integration.spec.ts`,
   `transactional-command-errors.integration.spec.ts` e os unitários do
   contrato, mais `transactional-command-no-module.integration.spec.ts` e
   `if-match-http.spec.ts` (ordens de decorador combinadas). A spec Angular
   nasceu na CTG7; nesta tríade sua edição fica sob lock explícito CTG5 e
   só fortalece as asserções de interoperabilidade, sem alterar produção
   Angular. Afirmar o corpo completo em cada ramo HTTP alcançável, igualdade
   com `X-Request-Id`, ausência de `code`/`context`, dois tenants, estado
   durável inalterado, configuração válida e recusas no bootstrap. O 503 sem
   módulo deve ser provado com e sem core; sem core, `X-Request-Id` inválido
   precisa ser substituído por UUIDv7 gerado. Dois pedidos concorrentes que
   recebem 409 devem ter IDs distintos, cada um igual ao próprio header.
   Cobrir explicitamente cada linha da matriz de alcance e fortalecer os
   testes `>=400`/`toMatchObject({code})` sem retirar seus controles de
   domínio/auditoria/chave.
   Manter e executar os negativos de rollback, a prova de status replay e os
   sensores legados. Testes primeiro; nenhuma redução de cobertura.
3. **Engineer:** após vermelho específico, alterar somente
   `packages/backend/src/transactional-command/**` e a prosa manual do README
   e changeset listados abaixo. Centralizar a criação de
   todas as rejeições CTG5; fazer a validação do código no módulo/scan de
   rota, resolver o ID no filtro apenas para `CommandRejectionResponse`, e
   manter `CommittedCommandResponse` com bytes UTF-8 e status exatos sem
   reescrever os corpos 502/422 escolhidos pelo consumidor. O filtro não
   guarda requestId em singleton. Engineer também atualiza a prosa manual
   de `packages/backend/README.md` e `.changeset/transactional-command-15.md`
   (grupo fixo) sobre envelope, padrão e migração; `package-readmes:write`
   só administra os trechos gerados. Não alterar `package.json`, lockfile,
   testes, `law/` nem rotas legadas. O maestro é o único a executar Git e
   cria commits por papel.

Gates focais: testes 409 HTTP/PostgreSQL, fault/race e interop Angular;
`pnpm check:rls-negative`, `pnpm check:rls-smoke`,
`pnpm check:trace --print`, `pnpm api:baselines`, lint/typecheck do backend,
`pnpm package-readmes:check`, DEVAI strict e delivery-review Opus PASS. A
importação na branch cumulativa exige os testes existentes verdes e nenhum
enfraquecimento. O único CI completo, PR, CI remoto e publicação permanecem
no gate final OD-S15-02.

## Alternativa não escolhida nesta proposta

A opção B exigiria ADR e exceção expressa no schema para a fronteira
transacional/legada. Não alterar `law/` nem declarar essa exceção sem uma
decisão específica do Owner.
