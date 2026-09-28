# CTG9 OFS — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e autoridades na ordem exigida, o contrato
`ctg9-ofs-contract.md`, `docs/framework/contracts/offline-sync-api.md`,
`INV-OFFLINE-001` e A1 §8.1/compatibilidade do DETRAN somente leitura.
Escreva **somente testes e fixtures** sob `packages/offline-sync/test/**`.
Não altere `src`, migrations, docs, law, generated, baselines ou outros
pacotes. Não execute Git, commit, push nem PR.
Os aliases de `auth`, `backend`, `contracts`, `idempotency`, `ratelimit` e
`sessions` para fontes atuais do teste PostgreSQL foram provisionados em
`c21ba672`. Nomeie sensores PostgreSQL `*.integration.spec.ts` para o
Vitest int coletá-los. Não edite o helper compartilhado
`packages/data/test/support/postgres.ts`.

UPS-OFS-01: PostgreSQL/RLS real com dois tenants; reserva concorrente sem
sobreposição, TTL do catálogo por tenant/órgão/operação e expiração,
agente de negócio separado do ator, bloqueio/fechamento/reconciliação/
liquidação/consulta de cada número, transições válidas/negativas e
repetições idempotentes sem reemitir número aplicado.

UPS-OFS-02: lotes >100, legado sem sequência e item sem chave apenas
`received`/código STYNX neutro mapeável pelo consumidor, identidade durável do
lote, conjunto declarado, sequência repetida 409/lacuna 422, replay de
ACK perdido, contexto divergente 409, hash igual/chave diferente e chave
igual/hash divergente com recibo rejeitado, crash e retomada sem efeito
duplicado. Prove namespace de chave sintética sem colisão com chave do
cliente e rejeição de chave cliente com prefixo `stynx:legacy:`;
duas submissões concorrentes do mesmo lote aberto, ausência do
resolver mantendo TTL publicado de 24h, e lote legado migrado fechado.
Teste service e HTTP Nest com envelopes/status existentes: falta de
`Idempotency-Key` continua 400, chave reaproveitada com corpo distinto
continua 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`, validação do domínio
tem precedência definida, e retry idêntico devolve status, bytes e headers
de replay configurados originais. Lote aberto ocupado responde 503
`OFFLINE_SYNC:BATCH:in-progress` com `Retry-After: 1` sem efeito novo;
recibo legado fechado reproduz entrada idempotente ainda válida do store
legado antes de conflito, com tenant/usuário/rota/chave/fingerprint iguais.
Prove negativos expired, fingerprint divergente, pending, ausente e corpo
sem representação byte-equivalente: falham fechados sem novo efeito;
spy confirma nenhum `reserve`/`persistResponse` no store legado. Compare
bytes/headers ao `IdempotencyInterceptor` publicado e negue replay
fabricado para `legacy_closed_unverified`.

UPS-OFS-03: applier de domínio e porta de evento recebem exatamente a
mesma `Transaction`, com efeito, consumo, recibo e evento em um commit;
falha interna reverte os quatro, resultado parcial persiste outros itens.
`@TransactionalCommand` indevido rejeita antes do primeiro write; efeito
que tenta `AuditSqlSink`/`withRequestContext`/`withSystemContext` e segunda
conexão falha tipado sem hang ou pool starvation. Itens sequenciais;
continuation pós-commit é permitida. Teste RLS negativo cross-tenant.
Após retry externo exaurido de 40P01/40001, item permanece aberto, sem
ACK concluído nem consumo. Prove isolamento cross-tenant também na
suspeita, conflito e resolução de UPS-OFS-04.

UPS-OFS-04: janela por agente/dispositivo, suspeita nos dois atos,
handoff autorizado, janela ausente/desligada, ações de resolução
permitidas/proibidas e legados não equiparados mecanicamente.

Inclua prova de upgrade 0001→0002 com fila/IDs, status e hashes preservados,
sem afirmar efeito já aplicado. A constraint antiga `(tenant_id,payload_hash)`
só cai depois da nova chave existir. Registre a matriz de paridade para o
consumidor em `packages/offline-sync/test/fixtures/consumer-parity-matrix.json`
ou no relatório final Inspector. STYNX prova envelopes/status neutros; HTTP
TEAT/BOAT e a paridade final pertencem ao DETRAN em R-0022/R-0024.
Os sensores exercitam serviço, HTTP e SQL; falha de
import ou migration ausente não substitui o vermelho por critério. Rode
sensores focais e registre vermelho esperado; não
enfraqueça testes. O maestro faz rebind de trace e commit Inspector.
Não importe nem copie código DETRAN. O Engineer/maestro mantém provas
`test/db/runtime` e `tenant-isolation-coverage.json` das novas tabelas.
