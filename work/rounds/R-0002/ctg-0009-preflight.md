# CTG-0009 — prévia condicional da adenda A1 §8.1

**Papel:** Architect. **Estado:** leitura e decomposição, sem despacho nem
contrato aprovado. A adenda A1 do DETRAN confirma UPS-SIG-01…04,
UPS-OBX-01…02 e UPS-OFS-01…04 como MUST para R-0022. A inclusão desses dez
IDs na publicação STYNX 1.5.0 aguarda a decisão do Owner sobre o conflito
entre OD-S15-01 e o gate após CTG8 da OD-S15-02. O DETRAN foi somente leitura.
Nenhuma API, teste, DDL ou pacote foi alterado por esta prévia.

## Lacunas verificadas

| Frente | Fonte STYNX atual                                                              | Lacuna para a adenda                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIG-01 | `SignatureService.sign/verify`, `SignatureRequest/Result`, backend do provedor | Falta nível mínimo tipado ADVANCED/QUALIFIED no pedido/resultado e recusa de resultado inferior; o backend pode fabricar CMS ou usar hora local quando falta evidência.          |
| SIG-02 | `StynxHealthModule.forRoot` aceita indicadores                                 | Falta probe tipado de PAdES/TSA/LTA/OCSP-ou-CRL e indicador de assinatura que derrube readiness; check ausente pode aparecer como `up/skipped`.                                  |
| SIG-03 | `SequentialSigner`, digest canônico limitado                                   | Só há digest recomputável, sem PAdES/certificado por signatário e com instante epoch zero; faltam manifestos de sessão/lote com vínculo verificável.                             |
| SIG-04 | Sem API de retirada                                                            | Falta verificação de retirada/revogação vinculada a documento, autor, evidência e instante.                                                                                      |
| OBX-01 | `OutboxService.enqueue` faz upsert por `(tenant,entity,entity_id)`             | Falta log append-only distinto da fila de despacho, dedup `(tenant,idempotencyKey)`, fonte `EventStreamSource` com cursor `(createdAt,id)` e visibilidade monotônica ao commit.  |
| OBX-02 | Dispatcher `send(row): Promise<void>`, ACK por agregado                        | Falta ledger de tentativas por evento/tenant com hashes de bytes exatos, protocolo/resultado do provedor e ACK inequívoco; migração precisa conservar pendências e histórico.    |
| OFS-01 | `reserveNumbering/cancelNumberingReservation`                                  | Faltam bloquear, fechar, reconciliar, liquidar e consultar consumo; TTL global de 24h substitui política por operação/tenant; `agentId` igual a `actorId`.                       |
| OFS-02 | `submitSyncBatch` e fila deduplicada por hash                                  | Faltam identidade durável de lote/dispositivo/sequência, conjunto declarado de chaves, recibo consultável e replay de ACK; chave obrigatória e limite 100 conflitam com legados. |
| OFS-03 | Cada método de store abre sua própria `Database.tx`                            | Falta porta de aplicação de item ao domínio com efeito, consumo, recibo e evento na mesma transação, com rollback por item e resultado parcial do lote.                          |
| OFS-04 | Conflito manual `device-wins/server-wins/manual-review`                        | Falta detector por janela/agente/dispositivos, exceção de handoff, suspeita nos dois atos e resolução por ações compatíveis com o consumidor.                                    |

As implementações atuais **não** comprovam a adenda: RC2 contém `signature`,
`outbox` e `offline-sync` sem essas mudanças. A tabela §7 continua aberta.

## Decisões antes de contratos vinculantes

| Autoridade | Decisão pendente                                                                                                                                                                                                | Efeito                                                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | Incluir os dez IDs de A1 §8.1 na STYNX 1.5.0 ou adiá-los expressamente, conciliando OD-S15-01 e OD-S15-02                                                                                                       | Nenhum contrato CTG9, worker ou versão final pode declarar os IDs dentro/fora do escopo por inferência.                                                                                                                                  |
| Owner      | Se incluída: aprovar o nível MUST de A1 e a substituição de `ADR-OUTBOX-0001` e `ADR-MOBILE-OFFLINE-0001` onde seus contratos de upsert, ordem/ACK, dedup por hash e limites impedem a adenda                   | Registrar ADRs superadoras antes de mudar comportamento normativo; `INV-OFFLINE-001.change_policy` exige aprovação humana e ADR para quebra. Atualizar `docs/framework/contracts/offline-sync-api.md` sem apagar compatibilidade legada. |
| Owner      | Qualquer limite novo de itens, chaves, hashes, UUIDs, numeração ou cursor SSE público distinto de `(createdAt,id)`                                                                                              | A1 §8.1 proíbe limite silencioso; o contrato Architect deve manter o cursor e limites atuais salvo decisão específica. O limite fixo 100 da 1.4.0 não pode impedir os lotes de mais de 100 previstos por A1.                             |
| Architect  | Canonicalização e trust policy genéricos de assinatura; cursor seguro ao commit; esquema de ledger, lease e ACK; identidade de lote e recibo; nomes de portas; numeração de migração e direção das dependências | Preparar alternativas e provas sem alterar produto. Fixar o contrato escolhido somente após as decisões Owner acima e prompt-review Opus.                                                                                                |

O `REVIEW` técnico Opus em
`reviews/ctg9-conditional-contract-review-1.json` identificou os riscos
abaixo. A revisão não libera workers e não resolve as decisões Owner.
O ciclo 2, salvo em `reviews/ctg9-conditional-contract-review-2.json`,
confirmou o reparo dos sete bloqueios iniciais, mas encontrou perda possível
na precisão em milissegundos do cursor SSE e no cursor inicial `now()`.
A estratégia de tupla `(ms, UUIDv7 monotônico)` e o barrier lock de `now()`
abaixo são uma proposta Architect para nova verificação, sem implementação.
O ciclo 3 em `reviews/ctg9-conditional-contract-review-3.json` confirmou essa
ordem de tuplas, mas identificou sentinela `id=''`, leitura de réplica atrasada
e ordem de locks no lote OFS; os reparos estão especificados abaixo.
O ciclo 4 em `reviews/ctg9-conditional-contract-review-4.json` confirmou o
reparo desses casos, mas mostrou que `Database.tx` aninha em SAVEPOINT sob
transação ambiente e que o audit hash chain ainda pode inverter locks com o
relógio outbox. A prévia abaixo passa a exigir uma fronteira top-level por
item e serialização de auditoria antes do relógio; ainda não há PASS.

## Contratos e provas necessários se o Owner incluir CTG9

1. **SIG:** a opção Architect para manifestos é JSON canônico RFC 8785 (JCS)
   com `manifestVersion` e identificador da canonicalização; rejeitar `Date`,
   `undefined`, `bigint`, binário e número não finito, exigir instante RFC
   3339 UTC validado e ligar bytes canônicos a SHA-256 do documento, tenant,
   ordem dos signatários, manifesto e evidência PAdES/certificado de cada um.
   Não reutilizar `canonicalJson` de `packages/signature/src/digest.ts`:
   seus casos de `Date`/`undefined`/binário não fornecem essa garantia. O nível
   ADVANCED/QUALIFIED alcançado deriva de cadeia ICP-Brasil, política, TSA e
   revogação **verificadas**, não da autodeclaração do provedor. Backend
   declara capacidades atestadas e `simulated`; `createMockSignatureBackend`,
   prefixo `/mock`, CMS sintético e hora local não podem satisfazer produção
   ou `minimumSignatureLevel >= ADVANCED`. Perfis ADR-0018 entram como
   política genérica injetada; o consumidor fornece matriz e âncoras de
   confiança. Inspector fixa vetores canônicos, adulteração de cada vínculo,
   época zero, capacidade ausente, nível inferior, backend simulado,
   retirada cruzada e presença/ausência dos perfis. Um indicador estrutural
   exportado de `signature` implementa a porta de health sem criar dependência
   `health → signature`; prontidão falha quando capacidade obrigatória falta.
2. **OBX:** manter `enqueue`/upsert legado e adicionar `append` explícito,
   com chave de idempotência obrigatória por `(tenant,key)`, log de fatos
   distinto da intenção de despacho e cursor público `(createdAt,id)`.
   Estratégia Architect a validar: uma linha de relógio por tenant
   é criada/atualizada numa única instrução
   `INSERT ... ON CONFLICT (tenant_id) DO UPDATE ... RETURNING`, que bloqueia
   a linha até o commit, inclusive na primeira corrida.
   Todo `created_at` do **novo log** é arredondado a milissegundos, como o
   `Date` de `EventStreamCursor`; o `id` é UUIDv7 ordenável, com o mesmo
   milissegundo e uma sequência global monotônica PostgreSQL `bigint`
   `CACHE 1 NO CYCLE`, obtida **sob o lock**. O valor inteiro não negativo
   completo (até 63 bits) ocupa os 74 bits ordenáveis `rand_a‖rand_b` do
   UUIDv7, sem módulo ou truncamento, inclusive quando vários tenants ou eventos
   compartilham um milissegundo. Sob o lock, o timestamp atribuído é
   `max(clock_timestamp() arredondado, último_ms)`; a sequência ordena os
   empates sem colisão global. Exaustão de `NO CYCLE` falha antes da escrita
   sem perder o evento; não introduzir um limite de taxa silencioso. SQL e
   objeto JS comparam a
   **mesma** tupla `(ms,id)`; UUID aleatório v4 não atende. O lock é adquirido
   após os locks de domínio e depois do lock da cadeia de auditoria do tenant,
   imediatamente antes do append; nenhuma escrita de domínio ocorre depois
   dele na **mesma transação de item**. A migração forward de plataforma
   deve fazer `audit.write` adquirir no início o mesmo advisory lock por
   tenant que `audit.write_command_event` já usa. O append adquire esse
   advisory lock **antes** do relógio; triggers auditados, comando CTG5,
   log/ledger/recibo auditado e append passam a seguir cadeia de auditoria
   → relógio, inclusive quando a cadeia ainda não tem linha. O advisory lock
   é reentrante no mesmo tx; nenhuma chamada auditada pode adquirir a cadeia
   pela primeira vez depois de deter o relógio. Um teste cruza comando CTG5
   que faz append com escrita de domínio auditada que também faz append.
   O applier OFS
   não mantém uma transação externa entre itens: cada item bem-sucedido
   confirma domínio, consumo, recibo e evento juntos; cada falha reverte
   somente seu item e o lote continua em outra transação. Testar dois lotes
   cruzados para deadlock e medir contenção por tenant. A serialização dura
   até commit ou rollback do item, não impõe limite fixo de taxa, mas pode
   reduzir throughput. O append usa isolamento READ COMMITTED. Se um chamador fornecer RR ou
   SERIALIZABLE, falhar fechado com erro tipado antes de escrever ou propagar
   40001 sem perda, com retry no limite externo do comando; não capturar e
   continuar dentro da transação abortada. Validar na conexão efetiva SQL
   `current_setting('transaction_isolation') = 'read committed'` e
   `transaction_read_only = off`; opções JS de uma `Database.tx` aninhada não
   bastam para impor essas condições.
   `EventStreamSource.now(scope)` também adquire o mesmo lock, atualiza o
   relógio com `max(clock_ms, agora_ms)` e devolve o valor confirmado; assim
   uma conexão entre append e commit espera, e qualquer append posterior
   recebe tupla maior. Eventos já confirmados no mesmo milissegundo podem
   reaparecer na conexão sem `Last-Event-ID`; o contrato assume entrega
   pelo menos uma vez, sem perda. `now`, `findById` e `listSince` do adapter
   usam o **primário**, papel app com `replica:false`, e verificam na conexão
   efetiva `pg_is_in_recovery() = false`; uma transação ambiente em réplica
   falha fechada. `now` tem grant de
   UPDATE na tabela do relógio com FORCE RLS, e as leituras nunca usam o pool
   reader/replica que pode atrasar. O novo log e seu mapa de IDs legados não
   são purgados na 1.5.0; um `Last-Event-ID` desconhecido mantém a semântica
   atual de reiniciar em `now()`, declarada como sem garantia de replay.
   `listSince` usa `(created_at,id)` exatos, inclusive com mais que
   `batchSize` eventos no mesmo milissegundo. O `id=''` do cursor inicial é
   o menor sentinela possível: SQL usa
   `created_at > $1 OR (created_at = $1 AND ($2 = '' OR id > NULLIF($2, '')::uuid))`;
   `NULLIF` impede o cast de `''` para UUID mesmo se o planner avaliar os
   lados do `OR` fora da ordem escrita. UUIDs são comparados como UUID,
   nunca como texto.
   `enqueue` legado não escreve no novo log sem o lock; na migração, os fatos
   legados expostos ao SSE recebem **novos** IDs UUIDv7 pela mesma sequência
   na ordem total de migração, com `created_at` arredondado a ms, relógio
   inicial ≥ último timestamp e sequência ajustada acima do maior valor
   migrado. O ID v4 legado fica só no mapa persistente de migração;
   `findById(legacyId)` devolve a nova tupla para permitir reconexão, e
   estado/ACK original são preservados. `findById` classifica ID UUIDv7
   canônico, ID legado presente no mapa e desconhecido; ID malformado não
   pode causar cast SQL ou erro silencioso. O despacho por agregado
   reivindica
   somente o evento **não terminal** mais antigo, incluindo PENDING, lease
   SENT sem ACK final e ERROR aguardando retry, sob schedulers concorrentes.
   O predicado `NOT EXISTS` que exclui sucessor com cabeça não terminal não
   usa `SKIP LOCKED`, mesmo quando o claim da própria cabeça o utiliza;
   claim tem lease/timeout e reaquisição após crash entre claim e send.
   Reclaim pode duplicar envio, portanto a entrega é pelo menos uma vez e
   encaminha `eventId`/chave ao provedor para deduplicação. ACK novo usa
   `(tenant,eventId)` ou `(tenant,idempotencyKey)`; ACK legado por agregado
   só prossegue se único, caso contrário falha fechado. Ledger tem uma linha
   por tentativa com bytes exatos/hashes de requisição e resposta, protocolo,
   resultado e provedor. Cada ACK recebido ganha linha própria; uma projeção
   separada guarda o estado atual, substituindo `UNIQUE(message_id)` legado.
   `tenant_id` é derivado do evento, não confiado ao payload externo, e FK
   composta `(tenant_id,event_id)` no ledger e no ACK impede vínculo cruzado
   mesmo no papel `owner`, que contorna RLS. ACK positivo posterior a ERROR
   avança o estado; duplicado é idempotente; inválido é registrado e rejeitado.
   Inspector usa PostgreSQL real, dois schedulers (inclusive cabeça travada),
   crash/reclaim, dois eventos do mesmo agregado, dois tenants, atraso de
   commit/cursor, nova conexão sem `Last-Event-ID` e append no mesmo
   milissegundo, mais que `batchSize` nesse milissegundo, ausência de leitura
   de réplica (inclusive `withReplica` ambiente), RR/40001 sem perda,
   Last-Event-ID UUIDv7/legado/malformado, migração v4 seguida por append no
   mesmo milissegundo, lock de audit vs relógio, retry, ACK válido/inválido,
   corrida da primeira linha de relógio e migração sem perda. A migração de plataforma
   usa o próximo número livre **≥0021**, sob lock do maestro, sem editar
   0018–0020. O adapter SSE pode implementar `EventStreamSource` no pacote
   outbox sem alterar `packages/backend` se o cursor permanecer.
3. **OFS:** `OfflineSyncAgentResolver` recebe contexto confiável e separa
   agente de negócio do ator auditável; o corpo HTTP continua proibido de
   fornecer identidade. `OfflineSyncPolicyResolver` fornece TTL, janela e
   limite aplicáveis por tenant/órgão/operação, com relógio injetável e
   fallback que preserva a política quando o parâmetro inexiste. A fila
   troca a unicidade exclusiva por hash por identidade
   `(tenant_id,idempotency_key)`, usando hash como integridade: mesma chave e
   hash repete; mesma chave e hash diferente rejeita/gera recibo de conflito;
   chaves diferentes e bytes iguais produzem dois itens. O contrato define
   tabela de lote com unicidade `(tenant,device_id,device_batch_id)` e
   `(tenant,device_id,batch_sequence)`, conjunto de chaves declarado, estado
   aberto/fechado e recibo durável; concorrência serializada, retomada após
   crash parcial e replay de lote fechado devolvendo o recibo. Lote legado
   sem sequência continua aceito; item sem chave usa a chave sintética
   existente, fica `received` com `TEAT.SYNC_LEGACY_ITEM_NOT_APPLIED` e não
   aplica domínio. Nova porta de applier opera **uma transação top-level
   independente por item** com `Database.tx`/`Transaction` da CTG5 para
   efeito, consumo, recibo e evento. `Database.tx` hoje usa SAVEPOINT quando
   encontra `TX_CONTEXT_KEY`; o contrato exige uma API pública de data para
   afirmar ausência de transação ambiente e falhar fechado com erro tipado
   **antes** do primeiro item. O endpoint de lote não usa
   `@TransactionalCommand`: sua identidade/idempotência vem do recibo de
   lote durável; um adotante que o monte sob o interceptor recebe essa
   rejeição tipada, sem abrir conexão extra, consumir pool ou escrever
   parcialmente. Não há transação externa de domínio retendo locks entre
   itens. O lote preserva resultado parcial e retoma pelo recibo durável;
   evento sai por porta injetada
   pelo consumidor, sem dependência direta OFS→OBX. O contrato precisa fixar
   precedência entre idempotência HTTP atual e recibo de domínio, inclusive
   com `mountControllers:false`, para não mascarar 409/422 nem recusar
   clientes legados. Inspector cobre o endpoint normal e um endpoint
   indevidamente montado sob `@TransactionalCommand` (erro tipado sem efeitos
   nem exaustão do pool), além de dois lotes cruzados com item 1 confirmado
   antes de começar o item 2. Cobre HTTP TEAT/BOAT, mais de 100 itens,
   sequência repetida/lacuna, ACK perdido, handoff, janela desligada,
   resolução permitida/proibida, concorrência e deadlock de lotes cruzados,
   rollback por item e RLS real.
   `migrations/0002_*.sql` faz backfill sem perder fila; DDL, teste de
   upgrade e `offline-sync-api.md` fixam a ordem de aplicação para adotantes
   e identificam itens legados. A correção do envelope CTG5 opção A foi
   executada sob autoridade Architect para código não publicado, recebeu
   delivery-review Opus PASS e foi integrada na branch cumulativa. Os
   409/422 da OFS deverão respeitar esse contrato e os corpos legados
   preservados. Isso não decide o escopo CTG9 nem autoriza substituir ADRs.

Para qualquer DDL: atualizar migration, DDL canônica quando o repositório
a mantiver para aquele schema, seed e `test/db`;
FORCE RLS, `pnpm check:rls-negative` e `pnpm test:int` são obrigatórios.
Arquivos gerados só pelos respectivos geradores. Tríades Architect →
Inspector → Engineer, prompt-review e delivery-review Opus, commits por papel,
trace/API baselines e changeset do grupo fixo seguem a R-0002.

## Paralelismo permitido

SIG usa lock `packages/signature/**`; o indicador estrutural fica nesse
pacote, sem `packages/health/**` até o contrato demonstrar necessidade.
OBX usa `packages/outbox/**`; o adapter SSE fica ali se a porta pública
existente bastar. OFS usa `packages/offline-sync/**`. Contratos Architect e
sensores Inspector desses três pacotes podem ser preparados em worktrees
isoladas ao mesmo tempo **depois** das decisões Owner e de prompt-review
PASS; Engineers nos caminhos de pacote podem trabalhar em paralelo após
sensores vermelhos, até três tarefas sem lock comum. **Locks compartilhados
serializados pelo maestro:** `packages/data`, migrations/DDL/seed/
`test/db`, eventual `packages/backend` SSE, `law/trace.json`, baselines,
`pnpm-lock.yaml`, changesets e READMEs gerados. Ordem de integração:
correção do envelope CTG5 (integrada) → contratos SIG/OBX/OFS; contrato de
evento OBX antes de ligar o applier OFS ao seu porto; SIG independente;
migrações e rebinds compartilhados sob lock. Importar somente checkpoints
com PASS e gates focais na branch cumulativa, sem PR/RC intermediário. A
revisão final da release continua um único gate local/PR/remoto/publicação
sob OD-S15-02, depois de todo MUST que o Owner confirmar no escopo.
