# CTG9 OBX/data — Engineer implementation task

Declare `Engineer` na primeira linha. Trabalhe na worktree cumulativa
indicada pelo maestro. Leia `AGENTS.md` e autoridades, `ctg9-obx-contract.md`,
ADR-OUTBOX-0002, docs públicas audit/outbox/CTG5 e os sensores Inspector
CTG9 commitados. DETRAN A1 §8.1 é somente leitura. Escreva apenas
`packages/data/src/**`, `packages/data/migrations/platform/0021*`,
`packages/outbox/src/**`, `packages/audit/src/**` e
`packages/backend/src/**` se necessário para o
adapter SSE. O maestro possui Git, DDL/seed canônicas compartilhadas,
`test/db/runtime`, manifests/lockfile, changesets, baselines, trace e
READMEs gerados. Não execute Git, commit, push, PR ou escrita no DETRAN.
Não altere testes nem faça shim/cópia DETRAN.

Implemente UPS-OBX-01…02 e pré-requisitos data/audit:

- `Database.txIndependent`, assert de conexão detida através de contextos
  derivados, isolamento efetivo de `TxOptions.isolation` e modo estrito só
  no item OFS. Preserve CTG5 e transações legadas fora do modo estrito.
- Migration aditiva ≥0021: três writers audit com advisory por tenant antes
  da cabeça, READ COMMITTED obrigatório, timestamp monotônico e partição
  escolhida, GUC de uma cadeia por tx, índice NULL/tenant, diagnóstico e
  selo de época legada sem rehash. RLS FORCE/negativas. Não edite
  migrations históricas 0018–0020.
- Event log imutável por tenant, chave idempotente e cursor `(createdAt,id)`
  commit-safe via clock row e UUIDv7; adapter SSE usa primário, preflight
  limitado e sem réplica, `now()` em tx curta independente. Appends usam a
  mesma `Transaction` do caller e selo apenas no modo OFS estrito.
- Projeção/lease de despacho, ledger de tentativas/ACK com bytes exatos e
  FKs tenant/event; quarentena owner-only para ACK sem identidade. Preserve
  as portas legadas. DDL só cria estruturas; cutover opt-in/idempotente de
  tabelas padrão com marker/locks, sem envio duplo, ACK e falha pós-corte
  espelhados. Rejeite trigger audit em tabelas mutadas antes do corte.
  Respeite o oráculo A/B/C corrigido no contrato; use NOWAIT/rollback
  integral quando UPDATE já está detido, sem inventar 55P03 quando só
  está enfileirado. Evento nativo despacha sem cutover.

Rode sensores focais PostgreSQL/RLS, testes existentes afetados, lint e
typecheck dos pacotes. Não edite arquivos gerados nem testes para obter
verde. Reporte símbolos reais, migração, riscos e gates. Qualquer
incompatibilidade concreta vai ao maestro para triagem, não a um shim.
