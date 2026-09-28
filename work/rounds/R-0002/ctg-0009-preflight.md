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

## Contratos e provas necessários se o Owner incluir CTG9

1. **SIG:** contrato de nível/capacidade/evidência confiável, manifesto com
   bytes canônicos e versão, PAdES/certificado/instante por signatário e
   retirada vinculada; perfis do DETRAN ficam no consumidor. Inspector prova
   presença/ausência por capacidade, provedor indisponível, nível inferior,
   documento/manifesto adulterado, signatário ausente e retirada cruzada;
   Engineer estende `packages/signature`, depois integra um indicador em
   `packages/health`. O contrato de assinatura antecede o indicador.
2. **OBX:** contrato distinto para log append-only e intenção de despacho,
   dedup por tenant/chave, cursor estável, retenção e visibilidade ao commit.
   Definir estratégia de watermark/ordem de commit **antes** do adapter SSE;
   `created_at DEFAULT clock_timestamp()` mais `ORDER BY` pode perder um
   evento que commita tarde. Preservar ACK legados só quando inequívocos e
   registrar tentativas por evento. Inspector usa PostgreSQL/RLS reais,
   dois eventos do mesmo agregado, duas tenants, corrida de commit/cursor,
   replay, retry/ACK e reconciliação de migração. Engineer adiciona migração
   posterior à 0018, sem editar arquivo aplicado, e porta `EventStreamSource`.
3. **OFS:** contrato de política por operação/tenant, agente de negócio
   distinto de ator auditável, transições de faixa, identidade de lote,
   recibos, applier de item e ações de resolução. Inspector cobre HTTP
   compatível, lote legado sem sequência/chave, mais de 100 itens, ACK
   perdido, 409/422, concorrência, rollback por item e isolamento RLS real.
   Engineer acrescenta APIs e migração posterior à 0001, com backfill sem
   perder fila. A porta de applier deve usar `Database.tx`/`Transaction`
   da CTG5 sem tornar o lote inteiro atômico quando só um item falha.

Para qualquer DDL: atualizar migration, DDL canônica, seed e `test/db`;
FORCE RLS, `pnpm check:rls-negative` e `pnpm test:int` são obrigatórios.
Arquivos gerados só pelos respectivos geradores. Tríades Architect →
Inspector → Engineer, prompt-review e delivery-review Opus, commits por papel,
trace/API baselines e changeset do grupo fixo seguem a R-0002.

## Paralelismo permitido

SIG usa locks `packages/signature/**` e, após contrato de capacidade,
`packages/health/**`. OBX usa `packages/outbox/**` e adapter SSE; OFS usa
`packages/offline-sync/**`. Contratos Architect e sensores Inspector desses
três pacotes podem avançar em worktrees isoladas ao mesmo tempo. Engineers
nos caminhos de pacote também podem avançar em paralelo após seus sensores
vermelhos, até o limite de três tarefas sem lock comum. **Locks compartilhados
serializados pelo maestro:** `packages/data`, migrations/DDL/seed/
`test/db`, `packages/backend` SSE, `law/trace.json`, baselines,
`pnpm-lock.yaml`, changesets e READMEs gerados. OBX deve fechar seu contrato
de eventos antes de OFS ligar o applier ao evento; SIG é independente.
Importar somente checkpoints com PASS e gates focais na branch cumulativa,
em ordem de dependência, sem PR/RC intermediário. A revisão final da release
continua um único gate local/PR/remoto/publicação sob OD-S15-02, depois de
todo MUST que o Owner confirmar no escopo.
