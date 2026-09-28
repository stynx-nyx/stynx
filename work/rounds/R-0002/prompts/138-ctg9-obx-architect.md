# CTG9 OBX — Architect worker

Declare `Architect` na primeira linha. Trabalhe somente em
`work/rounds/R-0002/ctg9-obx-contract.md`,
`law/adr/ADR-OUTBOX-0002-event-log-and-delivery.md`,
`docs/framework/contracts/outbox-api.md`,
`docs/framework/contracts/transactional-audit-idempotency-1.5.md` e
`docs/framework/contracts/audit-events-api.md`. O ADR declara a superação
pontual da decisão CTG5 alterada. Só o maestro atualiza os índices de
ADRs/contratos, serialmente, em commit Architect. Não execute Git, não commite,
não faça push/PR, não altere DETRAN nem produto/testes. O maestro controla
Git, migrações, baselines, trace, changeset e revisão.

Leia na ordem de `AGENTS.md` os documentos de autoridade, depois A1 §8.1
do DETRAN somente leitura, `ctg-0009-preflight.md`, review 6 e 7, código
real de outbox/data/audit/backend SSE. Este despacho é somente contrato
Architect e ADR superadora aditiva.

Defina UPS-OBX-01…02: preservar `enqueue` upsert e ACK legados, adicionar
append-only de fatos distintos por agregado, dedup `(tenant,key)`, cursor
SSE `(createdAt,id)` com clock transacional em milissegundos e UUIDv7
ordenável, leitura no primário, id legado mapeado, `now()` só na linha de
clock e deadline/503, sem perder evento em corrida de commit. Defina
`appendInTransaction(trx,event)` como porta para OFS, identidade efetiva do
tenant, isolamento READ COMMITTED, relação com `Database.txIndependent`.
Descreva DDL forward >=0021, migração de pendências/ACKs/história sem perda
ou segundo envio: preserve SENT em voo, lease e ACK já terminal. Inspector
cobre SENT em voo e ACK no momento da migração sem redespacho.
ledger de tentativas com bytes exatos/hashes, protocolo e provedor, lease,
claim da cabeça não terminal por agregado, ACK por evento, retries e prova
PostgreSQL/RLS com dois tenants e dois schedulers.

Feche a cadeia de auditoria: advisory único para três writers, timestamp
monotônico explícito sob lock em READ COMMITTED, RR/SERIALIZABLE falhando
antes de selecionar cabeça; classifique legado por links, misorder, fork e
hash mismatch sem rehash e sele com nova época auditável. Owner
`AuditSqlSink` pode gravar tenant real; GUC transacional impede cruzar duas
chaves. Inclua índice de cabeça, NULL tenant e ordem cadeia→relógio.
Defina `audit.verify_current_epoch` além de `verify_chain` particionado por
época, incluindo caso com mais de 1000 eventos legados. A recusa de
RR/SERIALIZABLE em writers tem MESSAGE fixa e erro data não retentável;
GUC mismatch usa SQLSTATE `STY41` antes do primeiro advisory e mapeia a
erro tipado. A GUC é autoproteção, não limite de segurança.
Descreva `Database.txIndependent` aditivo com holder ALS estrito no item,
sem mudar `Database.tx` legado fora do modo estrito. `now()` tem
`lockTimeoutMs`/55P03→503 e um preflight por tenant/processo, sem segurar
pool enquanto espera vaga. Append sela escritas posteriores; vários
eventos usam `appendManyInTransaction`; a porta unitária é
`appendInTransaction(trx,event)`. Dê nomes públicos exatos e matriz A1→testes.
O selo usa `SET LOCAL transaction_read_only = on` após o clock; o adapter
configura `lock_timeout` local em `now()`, e o backend SSE existente já
traduz falha da fonte em 503.
Não crie limites públicos novos nem edite migrações históricas.
