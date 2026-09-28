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
   Estratégia Architect a validar: uma linha de relógio/cursor por tenant
   bloqueada com `SELECT FOR UPDATE` durante todo o append, com timestamp
   estritamente crescente (`max(clock_timestamp(), anterior + 1µs)`), de modo
   que commit/rollback serializem a visibilidade sem perder evento tardio.
   Não depender apenas de `clock_timestamp()` e ordenação para commits fora
   de ordem. O despacho por agregado reivindica só seu evento pendente mais
   antigo sob schedulers concorrentes; claim tem lease/timeout e reaquisição
   após crash entre claim e send. ACK novo usa `(tenant,eventId)` ou
   `(tenant,idempotencyKey)`; ACK legado por agregado só prossegue se único,
   caso contrário falha fechado. Ledger tem uma linha por tentativa com bytes
   exatos/hashes de requisição e resposta, protocolo, resultado e provider;
   FK composta `(tenant_id,event_id)` tanto no ledger como no ACK impede
   vínculo cruzado mesmo no papel `owner`, que contorna RLS. ACK positivo
   posterior a ERROR avança o estado; duplicado é idempotente; inválido é
   registrado e rejeitado. Inspector usa PostgreSQL real, dois schedulers,
   crash/reclaim, dois eventos do mesmo agregado, dois tenants, atraso de
   commit/cursor, retry, ACK válido/inválido e migração sem perda. A migração
   de plataforma usa o próximo número livre **≥0021**, sob lock do maestro,
   sem editar 0018–0020. O adapter SSE pode implementar `EventStreamSource`
   no pacote outbox sem alterar `packages/backend` se o cursor permanecer.
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
   aplica domínio. Nova porta de applier opera cada item na mesma
   `Database.tx`/`Transaction` da CTG5 para efeito, consumo, recibo e evento,
   mas preserva resultado parcial entre itens; evento sai por porta injetada
   pelo consumidor, sem dependência direta OFS→OBX. O contrato precisa fixar
   precedência entre idempotência HTTP atual e recibo de domínio, inclusive
   com `mountControllers:false`, para não mascarar 409/422 nem recusar
   clientes legados. Inspector cobre HTTP TEAT/BOAT, mais de 100 itens,
   sequência repetida/lacuna, ACK perdido, handoff, janela desligada,
   resolução permitida/proibida, concorrência, rollback por item e RLS real.
   `migrations/0002_*.sql` faz backfill sem perder fila; DDL e teste de
   upgrade identificam itens legados. Esta frente depende da correção do
   envelope CTG5 aprovada pelo Owner; se outra solução for escolhida, os
   409/422 da OFS são revistos antes do contrato.

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
correção autorizada do envelope CTG5 → contratos SIG/OBX/OFS; contrato de
evento OBX antes de ligar o applier OFS ao seu porto; SIG independente;
migrações e rebinds compartilhados sob lock. Importar somente checkpoints
com PASS e gates focais na branch cumulativa, sem PR/RC intermediário. A
revisão final da release continua um único gate local/PR/remoto/publicação
sob OD-S15-02, depois de todo MUST que o Owner confirmar no escopo.
