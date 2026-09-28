# CTG9 OBX/data — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e autoridades na ordem exigida, os contratos
`ctg9-obx-contract.md`, `docs/framework/contracts/outbox-api.md`,
`audit-events-api.md`, `transactional-audit-idempotency-1.5.md`, e A1 §8.1
do DETRAN somente leitura. Escreva **somente testes e fixtures** sob
`packages/outbox/test/**` e `packages/data/test/**`. Não altere `src`,
migrations, docs, law, generated, baselines ou outros pacotes. Não execute
Git, commit, push nem PR.

UPS-OBX-01: com PostgreSQL/RLS real e dois tenants, prove dois fatos do
mesmo agregado, replay de chave igual/conteúdo divergente, cursor
`(createdAt,id)` estável sob commit atrasado, primeira linha de clock em
corrida, mais que batchSize no mesmo ms, UUIDv7 e mapa legado v4,
`Last-Event-ID` desconhecido/malformado, primário obrigatório, 503 no
lock timeout sem esgotar pool de outros tenants. Exercite append genérico
no callback CTG5 seguido da auditoria/idempotência, e selo 25006 apenas no
item OFS estrito; mesmo `Transaction` sem conexão adicional.

UPS-OBX-02: duas filas concorrentes, cabeça não terminal travada, SENT em
voo e lease, crash/reclaim, retry, bytes exatos/hashes/protocolo/provedor
no ledger, ACK HMAC válido/inválido/duplicado/tardio/ambíguo e FK
tenant/event; upgrade de PENDING, ERROR, SENT e ACKED com um ACK chegando
no corte, sem redespacho nem perda. Prove DDL sem cutover para adotante
que só usa `dispatchDue`; cutover opt-in idempotente sob lock de linhas;
duas filas (legada e nova) nunca reivindicam a mesma linha; ACK legado
de SENT em voo atualiza projeção/ledger na mesma transação; enqueue após
cutover e tabelas customizadas têm resultado definido. ACK de HMAC inválido
ou evento desconhecido vai para quarentena owner-only sem FK de tenant;
o ledger por evento mantém a FK e o `UNIQUE(message_id)` legado continua.
Inclua timestamp escolhido para partição auditada de virada mensal.

Data/audit: três writers e trigger concorrente, três eventos na mesma tx,
BEGIN invertido, RR×RC e SERIALIZABLE×RC sem fork, erro de isolamento não
retentável após uma tentativa, owner `AuditSqlSink` tenant real, X→NULL
STY41 antes de segundo advisory, NULL sentinel e contenção. Banco legado
linear mas temporalmente fora de ordem, fork e hash mismatch são
diagnosticados/selados sem rehash; `verify_chain` e
`verify_current_epoch` cobrem >1000 eventos antigos e nova época. `txIndependent`
estrito impede conexões extras via contextos derivados até com concorrência
igual ao pool; fora do modo estrito, CTG5/i18n/ratelimit/tenancy continuam.

Os sensores devem exercitar SQL/comportamento esperado; uma migration ou
import ausente não substitui o vermelho de cada critério. Rode sensores
focais contra o código atual e registre vermelho esperado;
não enfraqueça testes. Use fixtures PostgreSQL isoladas e respeite
`pnpm check:rls-negative`/`pnpm test:int` na validação posterior. O maestro
faz rebind de trace e commit Inspector.
