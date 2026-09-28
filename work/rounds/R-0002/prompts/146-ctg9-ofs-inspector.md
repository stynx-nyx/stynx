# CTG9 OFS — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e autoridades na ordem exigida, o contrato
`ctg9-ofs-contract.md`, `docs/framework/contracts/offline-sync-api.md`,
`INV-OFFLINE-001` e A1 §8.1/compatibilidade do DETRAN somente leitura.
Escreva **somente testes e fixtures** sob `packages/offline-sync/test/**`.
Não altere `src`, migrations, docs, law, generated, baselines ou outros
pacotes. Não execute Git, commit, push nem PR.

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
cliente, duas submissões concorrentes do mesmo lote aberto, ausência do
resolver mantendo TTL publicado de 24h, e lote legado migrado fechado.
Teste service e HTTP Nest com envelopes/status existentes: falta de
`Idempotency-Key` continua 400, chave reaproveitada com corpo distinto
continua 422 `IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY`, validação do domínio
tem precedência definida, e retry idêntico devolve status e bytes originais;
registre limite da prova STYNX e matriz de paridade TEAT/BOAT para o
consumidor validar em R-0022/R-0024, sem copiar código DETRAN.

UPS-OFS-03: applier de domínio e porta de evento recebem exatamente a
mesma `Transaction`, com efeito, consumo, recibo e evento em um commit;
falha interna reverte os quatro, resultado parcial persiste outros itens.
`@TransactionalCommand` indevido rejeita antes do primeiro write; efeito
que tenta `AuditSqlSink`/`withRequestContext`/`withSystemContext` e segunda
conexão falha tipado sem hang ou pool starvation. Itens sequenciais;
continuation pós-commit é permitida. Teste RLS negativo cross-tenant.

UPS-OFS-04: janela por agente/dispositivo, suspeita nos dois atos,
handoff autorizado, janela ausente/desligada, ações de resolução
permitidas/proibidas e legados não equiparados mecanicamente.

Inclua prova de upgrade 0001→0002 com fila/IDs preservados, sem afirmar
efeito já aplicado. Os sensores exercitam serviço, HTTP e SQL; falha de
import ou migration ausente não substitui o vermelho por critério. Rode
sensores focais e registre vermelho esperado; não
enfraqueça testes. O maestro faz rebind de trace e commit Inspector.
