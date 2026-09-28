# CTG-0009 — contrato em revisão da adenda A1 §8.1

**Papel:** Architect. **Estado:** escopo incluído pela OD-S15-03; contrato
técnico ainda em revisão, sem despacho ou implementação CTG9. A adenda A1
do DETRAN confirma UPS-SIG-01…04, UPS-OBX-01…02 e UPS-OFS-01…04 como MUST,
e o Owner os incluiu na publicação STYNX 1.5.0. O gate consolidado da
OD-S15-02 passa a ocorrer após CTG9. O DETRAN permanece somente leitura.

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

| Autoridade | Decisão pendente                                                                                                                                                                                                | Efeito                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | **Resolvido pela OD-S15-03:** incluir os dez IDs de A1 §8.1 na STYNX 1.5.0                                                                                                                                      | A final exige prova de conformidade dos dez MUST; gate consolidado somente depois da CTG9.                                                                                                                              |
| Owner      | OD-S15-03 incluiu os MUST de A1 e autorizações prévias permitem as ações necessárias; a implementação aditiva preserva `enqueue`, ACK e rotas legados.                                                          | Registrar ADRs superadoras antes de habilitar os novos modos OBX/OFS. Não enfraquecer `INV-OFFLINE-001`; se uma quebra se mostrar inevitável, voltar ao Owner com delta exato, ADR e prova antes de mutar o invariante. |
| Owner      | Qualquer limite novo de itens, chaves, hashes, UUIDs, numeração ou cursor SSE público distinto de `(createdAt,id)` permanece sem decisão específica.                                                            | Não introduzir esses limites. O limite fixo 100 da 1.4.0 não pode impedir lotes de mais de 100 previstos por A1.                                                                                                        |
| Architect  | Canonicalização e trust policy genéricos de assinatura; cursor seguro ao commit; esquema de ledger, lease e ACK; identidade de lote e recibo; nomes de portas; numeração de migração e direção das dependências | Preparar alternativas e provas sem alterar produto. Fixar o contrato escolhido somente após as decisões Owner acima e prompt-review Opus.                                                                               |

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
O ciclo 5 em `reviews/ctg9-conditional-contract-review-5.json` confirmou que
essas obrigações eram insuficientes: `audit.fn_row_change` trava a cabeça sem
advisory, e `runWithRequestContext`/`runWithSystemContext` podem apagar
`TX_CONTEXT_KEY` do CLS. A prévia abaixo passa a exigir a redefinição do
trigger, uma marca herdável de conexão em uso fora desse CLS e uma porta de
append que opera na mesma `Transaction` do item. O ciclo 6 em
`reviews/ctg9-conditional-contract-review-6.json` apontou ainda o uso de
`now()`/UUIDv4 na cabeça da cadeia, regressão de `Database.tx` legado e
contenção SSE por advisory no `now()`. Esta revisão do contrato fixa
timestamp monotônico explícito, `txIndependent` aditivo e `now()` somente
no relógio, com holder ALS mutável; ainda não há PASS.

## Contratos e provas necessários para CTG9 incluída

1. **SIG:** a opção Architect para manifestos é JSON canônico RFC 8785 (JCS)
   com `manifestVersion` e identificador da canonicalização; rejeitar `Date`,
   `undefined`, `bigint`, binário e número não finito, exigir instante RFC
   3339 UTC validado e ligar bytes canônicos a SHA-256 do documento, tenant,
   ordem dos signatários, manifesto e evidência PAdES/certificado de cada um.
   Não reutilizar `canonicalJson` de `packages/signature/src/digest.ts`:
   seus casos de `Date`/`undefined`/binário não fornecem essa garantia. O nível
   ADVANCED/QUALIFIED alcançado deriva de cadeia ICP-Brasil, política, TSA e
   revogação **verificadas**, não da autodeclaração do provedor. STYNX entrega
   verificador criptográfico concreto de CMS/PAdES ByteRange, cadeia X.509,
   política OID, token RFC 3161 e OCSP/CRL assinados; o consumidor injeta
   âncoras, políticas e fetchers. O hash do manifesto esperado precisa
   coincidir com o hash vinculado na evidência. Backend
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
   **mesma** tupla `(ms,id)`; UUID aleatório v4 não atende. O append adquire
   o advisory lock da cadeia de auditoria do tenant **antes** do relógio;
   nenhuma escrita de domínio ocorre depois do relógio na mesma transação
   de item. Essa é a ordem cadeia → relógio, não uma ordem global de locks
   de domínio. A migração forward de plataforma redefine
   **`audit.fn_row_change` de 0017, `audit.write` e
   `audit.write_command_event`** para adquirir o mesmo advisory lock antes
   do `SELECT ... FOR UPDATE` da cabeça. A chave é o tenant usado no filtro
   `tenancy_id` (`app.tenant_id` no trigger, argumento no write), com uma
   sentinela fixa e não NULL para a cadeia sem tenant. Para tenant real,
   preserva a chave de 0020. O trigger nunca pode travar a cabeça antes
   de pedir o advisory. A tabela de relógio não recebe
   `audit.fn_row_change`; `now()` não pode tomar a cadeia depois do relógio.
   Log, ledger ou recibo auditado segue a mesma ordem. O advisory sozinho
   não escolhe a cabeça: o default `occurred_at=now()` usa o início da
   transação e o desempate por UUIDv4 é aleatório. A migração forward
   redefine os três writers para, **sob o advisory e antes do INSERT**,
   atribuir `occurred_at` explicitamente como o maior entre
   `clock_timestamp()` e `head.occurred_at + 1µs`. A cabeça
   continua ordenada por `(occurred_at,event_id)`, mas o timestamp novo é
   estritamente maior que o último timestamp do tenant, inclusive após
   BEGIN em ordem inversa ou várias escritas na mesma transação. O hash
   recebe esse timestamp já escolhido. Como uma transação REPEATABLE READ
   pode ler cabeça antiga após obter o advisory, **cada um dos três writers**
   verifica `transaction_isolation = read committed` antes de selecionar a
   cabeça; RR/SERIALIZABLE falham com SQLSTATE `40001`, MESSAGE fixa
   `audit_chain_requires_read_committed` e HINT para repetir com RC.
   `packages/data` converte esse caso em erro tipado **não retentável** na
   mesma configuração; não repete três vezes nem recomenda retry externo
   com o mesmo isolamento. Outros `40001` genuínos seguem retentáveis.
   A migração não altera hashes ou timestamps legados.
   Antes de ativar os novos writers, percorre `previous_hash` por tenant,
   inclusive NULL, e classifica o legado em linear por links, par linear
   mas fora da ordem temporal, fork ou hash mismatch. Não aborta a migração
   por defeito legado; guarda diagnóstico e tips em uma tabela de épocas e
   sela a cadeia com evento âncora explícito após o maior timestamp legado,
   sob o advisory. Esse evento inicia **nova época** (`previous_hash=NULL`),
   sem declarar o segmento antigo conforme. `audit.verify_chain` mantém
   assinatura e colunas públicas, aceita tenant NULL e usa `lag()`
   particionado pela época (âncora = GENESIS). A nova função
   `audit.verify_current_epoch(tenant,limit)` inicia na âncora vigente,
   mesmo com mais de `p_limit` eventos legados. Eventos legados inválidos
   continuam `chain_valid=false`. Uma função nova expõe estado da época
   antiga, tips e divergências sem suprimir nenhuma linha. Erro na própria
   migração aborta normalmente; hash mismatch legado fica diagnosticado
   e exige avaliação Owner antes de **publicar** a final se existir no
   banco de release. Inspector cobre par legado misordered, fork de três
   eventos, mismatch, três eventos novos numa transação, BEGIN invertido,
   RR×RC e SERIALIZABLE×RC sem bifurcação. Índices da cabeça incluem
   `(tenancy_id,occurred_at DESC,event_id DESC)` e parcial para NULL;
   buscas evitam `IS NOT DISTINCT FROM` no caminho crítico.
   A sentinela advisory fixa de NULL tenant serializa escritas globais;
   medir espera/latência de dois escritores globais. `audit.write` continua
   com EXECUTE revogado para app; o caller real `AuditSqlSink` escreve em
   papel owner com `p_tenant_id` real ou NULL. A primeira escrita da
   transação grava a chave de cadeia em GUC local `stynx.audit_chain_key`;
   os três writers rejeitam uma segunda chave diferente com SQLSTATE
   `STY41`, mapeado a `AuditChainKeyMismatchError`, **antes** de travar
   outro advisory, inclusive em `write_command_event`, que hoje pede
   advisory antes de delegar a `audit.write`. A GUC é autoproteção de
   transação, não uma fronteira de segurança contra SQL arbitrário.
   Assim, owner pode escrever o
   tenant X, mas X→NULL na mesma transação falha sem deadlock. NULL fica
   reservado para operações owner de sistema. Não criar tenant falso.
   O Inspector cruza comando CTG5 com handler não auditado versus handler
   auditado, com e sem append, e duas transações de trigger concorrentes.
   Deadlocks entre locks de domínio e advisory ainda podem ocorrer:
   40P01/40001 após retries esgotados é resultado de item **retentável**,
   com rollback sem consumo, evento ou ACK aplicado; o recibo de lote não
   marca o item como concluído.
   O applier OFS
   não mantém uma transação externa entre itens: cada item bem-sucedido
   confirma domínio, consumo, recibo e evento juntos; cada falha reverte
   somente seu item e o lote continua em outra transação. Testar dois lotes
   cruzados para deadlock e medir contenção por tenant. A serialização dura
   até commit ou rollback do item, não impõe limite fixo de taxa, mas pode
   reduzir throughput. O append usa isolamento READ COMMITTED. `Database.tx`
   aplica `TxOptions.isolation` no top-level antes da primeira query de
   sessão; o item OFS pede explicitamente `read committed`. Em transação
   aninhada, uma opção de isolamento divergente falha fechada. Se um
   chamador fornecer RR ou SERIALIZABLE, falhar fechado com erro tipado
   antes de escrever; reexecutar somente com RC. Outros `40001` de
   concorrência usam retry no limite externo do comando, sem capturar e
   continuar dentro da transação abortada. Validar na conexão efetiva SQL
   `current_setting('transaction_isolation') = 'read committed'` e
   `transaction_read_only = off`; opções JS de uma `Database.tx` aninhada não
   bastam para impor essas condições.
   `EventStreamSource.now(scope)` **não** adquire o advisory de auditoria:
   toma somente a linha de relógio por `INSERT ... ON CONFLICT ... DO UPDATE`
   com `lockTimeoutMs` curto configurável aplicado por
   `trx.query('SET LOCAL lock_timeout ...')` no adapter. O backend SSE já
   traduz erro da fonte em 503 `SSE_SOURCE_UNAVAILABLE`; SQLSTATE `55P03`
   preserva esse caminho e o cliente retenta. Apenas um preflight `now()` por
   tenant/processo segura conexão de cada vez; esperas adicionais ficam
   fora do pool e têm deadline, preservando conexões para outros tenants.
   `appendInTransaction` é a última escrita de negócio; após o clock,
   executa `SET LOCAL transaction_read_only = on` na mesma `Transaction`.
   PostgreSQL recusa qualquer escrita posterior com SQLSTATE `25006`, já
   traduzido a `ReadOnlyViolationError` por data. Para vários fatos na
   mesma transação, usar `appendManyInTransaction` antes de selar.
   Esta é API nova, sem alterar
   `enqueue` legado.
   Atualiza o relógio com `max(clock_ms, agora_ms)` e devolve o valor
   confirmado; assim
   uma conexão entre append e commit espera, e qualquer append posterior
   recebe tupla maior. Eventos já confirmados no mesmo milissegundo podem
   reaparecer na conexão sem `Last-Event-ID`; o contrato assume entrega
   pelo menos uma vez, sem perda. `now`, `findById` e `listSince` do adapter
   usam o **primário**, papel app com `replica:false`, e verificam na conexão
   efetiva `pg_is_in_recovery() = false`; uma transação ambiente em réplica
   falha fechada. `now` tem grants de INSERT e UPDATE na tabela do relógio
   com FORCE RLS e política `WITH CHECK` por tenant; o Inspector cobre o
   primeiro `now()` de um tenant sem eventos. As leituras nunca usam o pool
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
   `enqueue` legado não escreve no novo log sem o lock. A DDL apenas cria
   estruturas; o cutover por adotante é opt-in, idempotente e bloqueia as
   linhas legadas com `FOR UPDATE`. Marca cada linha migrada com o evento
   correspondente para que o dispatcher legado exclua apenas as marcadas
   e o ACK legado de SENT em voo atualize a projeção na mesma transação.
   Sem cutover, o dispatcher e ACK legados continuam funcionais. Enqueue
   pós-cutover e tabelas customizadas têm política explícita no contrato.
   Na migração opt-in, os fatos legados expostos ao SSE recebem **novos**
   IDs UUIDv7 pela mesma sequência
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
   separada guarda o estado atual; a tabela e `UNIQUE(message_id)` legados
   permanecem. ACK sem evento/tenant confiável entra em quarentena owner-only
   sem FK tenant; ACK vinculado usa o ledger com FK composta.
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
   independente por item** com `Database.txIndependent`/`Transaction` para
   efeito, consumo, recibo e evento. `Database.tx` hoje usa SAVEPOINT quando
   encontra `TX_CONTEXT_KEY`. A API pública de data para afirmar ausência
   de transação ambiente usa uma marca `AsyncLocalStorage` própria de
   conexão detida, herdável através de `runWithRequestContext` e
   `runWithSystemContext`, além de consultar o CLS. A marca é um holder
   mutável `{ held: boolean, strict: boolean }`, posto em `false` no `finally` após
   commit/rollback e release; continuations posteriores ao commit não
   ficam bloqueadas. `Database.txIndependent` chama
   `assertNoHeldConnection` **antes** de obter conexão, inclusive quando
   `TX_CONTEXT_KEY` tiver sido apagado por contexto derivado, e falha com
   erro tipado se houver transação ativa. Dentro do item OFS, ativa
   `strict=true`: qualquer `Database.tx` que precisaria abrir **outra**
   conexão, inclusive via `withRequestContext`/`withSystemContext`, falha
   antes de `pool.connect` em qualquer papel. SAVEPOINT na mesma conexão
   continua possível, mas a porta de domínio recebe a `Transaction` do
   item e deve usá-la diretamente. Fora de `txIndependent` estrito,
   `Database.tx` legado conserva a semântica publicada de contexto derivado
   (i18n, ratelimit, tenancy, audit e preferences). O modo estrito também
   cobre o callback de efeito fornecido pelo consumidor, não só a porta
   de evento; impede ciclo invisível no Node esperando o advisory da
   própria transação em outra conexão.
   O serviço de lote consulta a nova API antes de **qualquer escrita,
   inclusive criar ou abrir o recibo durável de lote**; não basta testar
   antes do primeiro item. O endpoint de lote não usa
   `@TransactionalCommand`: sua identidade/idempotência vem do recibo de
   lote durável; um adotante que o monte sob o interceptor recebe essa
   rejeição tipada, sem abrir conexão extra, consumir pool ou escrever
   parcialmente. Não há transação externa de domínio retendo locks entre
   itens. Itens são aplicados estritamente em sequência no mesmo request;
   `Promise.all` sobre um mesmo store CLS é rejeitado ou cada item recebe
   um contexto isolado e uma conexão própria com prova de limite de pool.
   O lote preserva resultado parcial e retoma pelo recibo durável. A porta
   de evento OFS→OBX recebe a **mesma `Transaction` do item** e chama
   `appendInTransaction(trx, event)` sem `withSystemContext` ou
   `Database.tx` internos. O append verifica no cliente efetivo que
   `app.tenant_id` corresponde ao tenant do evento e rejeita execução fora
   da transação do item. Assim, domínio/consumo/recibo/evento têm um único
   commit, sem dependência direta OFS→OBX. O contrato fixa o header
   `Idempotency-Key` obrigatório (400 se ausente), checagens de identidade
   e conjunto declarado do lote antes da comparação da chave de transporte,
   422 legado para chave reaproveitada com corpo diferente e replay dos
   bytes/status originais de recibo fechado. O serviço sem controller usa
   identidade de invocação própria; nenhum interceptor genérico antecipa
   esses resultados. Inspector cobre o endpoint normal e um endpoint
   indevidamente montado sob `@TransactionalCommand`, com
   `withRequestContext` por item, ou cuja porta de evento tente
   `withSystemContext`/nova `Database.txIndependent`: erro tipado antes de qualquer
   escrita, sem conexão extra ou exaustão do pool mesmo quando a
   concorrência iguala o tamanho do pool. Cobre tentativa de `Promise.all`
   no mesmo store CLS e dois lotes cruzados com item 1 confirmado antes
   de começar o item 2. Cobre HTTP TEAT/BOAT, mais de 100 itens,
   sequência repetida/lacuna, ACK perdido, handoff, janela desligada,
   resolução permitida/proibida, concorrência e deadlock de lotes cruzados,
   rollback por item e RLS real. Regressão CTG5: handler dentro do envelope
   continua podendo usar i18n/ratelimit/`withSystemContext` com tenancy;
   applier OFS sob o envelope falha antes da primeira escrita sem conexão
   extra. Um efeito de domínio que chama `AuditSqlSink`,
   `withRequestContext` ou `withSystemContext` e tenta abrir outra conexão
   falha tipado sem hang, com concorrência igual aos pools app e owner;
   continuation após commit pode iniciar trabalho legítimo.
   `migrations/0002_*.sql` faz backfill sem perder fila; DDL, teste de
   upgrade e `offline-sync-api.md` fixam a ordem de aplicação para adotantes
   e identificam itens legados. A correção do envelope CTG5 opção A foi
   executada sob autoridade Architect para código não publicado, recebeu
   delivery-review Opus PASS e foi integrada na branch cumulativa. Os
   409/422 da OFS deverão respeitar esse contrato e os corpos legados
   preservados. O escopo CTG9 foi decidido pela OD-S15-03; ADRs superadoras
   aditivas continuam exigidas antes da implementação normativa.

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
existente bastar. OFS usa `packages/offline-sync/**`. Contratos e ADRs
Architect podem ser preparados em paralelo após prompt-review PASS;
sensores Inspector vêm depois da aceitação desses contratos/ADRs.
Engineers nos caminhos de pacote podem trabalhar em paralelo após
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
