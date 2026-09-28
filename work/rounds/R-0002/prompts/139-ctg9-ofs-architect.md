# CTG9 OFS — Architect worker

Declare `Architect` na primeira linha. Trabalhe somente em
`work/rounds/R-0002/ctg9-ofs-contract.md`,
`law/adr/ADR-MOBILE-OFFLINE-0002-sync-parity.md` e
`docs/framework/contracts/offline-sync-api.md`. Não execute Git, não
commite, não faça push/PR, não altere DETRAN nem produto/testes. O maestro
controla Git, migrações, baselines, trace, changeset e revisão. Só o maestro
atualiza os índices de ADRs/contratos em commit Architect. O contrato OFS
cita `Database.txIndependent` e as portas OBX pelos nomes estáveis, sem
redefinir a semântica de data/audit/outbox.

Leia na ordem de `AGENTS.md` os documentos de autoridade, depois A1 §8.1
e a compatibilidade vinculante no DETRAN somente leitura, a prévia
`ctg-0009-preflight.md`, reviews 6 e 7, APIs/store/controller/migration
reais de offline-sync, `INV-OFFLINE-001` e ADR anterior. Este despacho é
somente contrato Architect e ADR superadora aditiva.

Defina UPS-OFS-01…04: operações reservar/cancelar/bloquear/fechar/
reconciliar/liquidar/consultar consumo de numeração, transições e ausência
de sobreposição; TTL resolvido por tenant/órgão/operação via porta com
relógio testável; agente de negócio distinto do ator confiável. Lotes
duráveis por `(tenant,device,device_batch_id)`, sequência e conjunto
declarado; idempotência de item `(tenant,key,hash)`, recibos consultáveis,
replay de ACK, conflitos 409 e lacuna 422, legado sem sequência e item sem
chave apenas `received`. Preserve mais de 100 itens e envelopes/rotas/status
existentes. Applier por item usa `Database.txIndependent` e mesma Transaction
para efeito, consumo, recibo e porta OBX `appendInTransaction`; o modo
estrito proíbe qualquer serviço de domínio de abrir uma segunda conexão
por wrapper CLS enquanto o item detém locks. Falha de
item reverte apenas o item e permite parcial. Detector de concorrência por
janela/agente/dispositivos com handoff e resolução equivalente sem equiparar
mecanicamente nomes legados. Dê nomes públicos exatos, DDL forward 0002,
provas de upgrade, HTTP TEAT/BOAT e PostgreSQL/RLS com dois tenants.

Não enfraqueça `INV-OFFLINE-001` nem introduza limites públicos novos. Se
alguma quebra se mostrar inevitável, documente o delta exato para decisão
Owner antes de alterar invariantes. Não copie código DETRAN.
