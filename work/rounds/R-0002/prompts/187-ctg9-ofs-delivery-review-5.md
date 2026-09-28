# CTG9 OFS — delivery-review ciclo 5, reparos do ciclo 4

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, autoridades,
DETRAN C-0002 A1 §8.1 (somente leitura),
`work/rounds/R-0002/ctg9-ofs-contract.md`, o veredito
`reviews/ctg9-ofs-delivery-review-4.bridge.json`, o prompt-review focal
186 e seu resultado, prompt-review focal 188 com PASS estruturado em
`reviews/ctg9-ofs-contract-delta-prompt-review-5.json`, fonte
`packages/offline-sync/src/**`, migration 0002,
testes `packages/offline-sync/test/**` e
`test/db/offline-sync-durable-migration.spec.ts`. Não edite, não execute
Git e não escreva no DETRAN.

Decida os quatro MUST UPS-OFS-01…04 sobre a árvore congelada.
Em particular, comprove que: o sensor de fencing captura token/geração
da lease antes do takeover e observa 409 do titular antigo sem efeito;
os dois contendores alcançam o store sob lease válida e cada resultado
é replay byte-idêntico ou 503 retryable; 55P03 não abre rota de replay
para contexto/seq/chaves/fingerprint divergentes; sequência PG 1,
duplicata e gap tem códigos/corpos; novo transporte K2 com mesmo lote
aberto e `payloadJson` alterado sob `payloadHash` igual recebe 409
antes de applier/eventPort, enquanto K2 com payload original retoma;
contagem de duplicados não deriva da retomada; applier sem eventPort
falha antes da primeira escrita; `requestId` corrente, CTG5 envelope,
headers de replay e keyed sem applier têm sensores reais. Confira
RLS, rollback por item, SSE/outbox port e compatibilidade E6. Separe
lacunas do consumidor DETRAN das obrigações STYNX. Não conclua PASS
por contagem de testes sem examinar as asserções.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
