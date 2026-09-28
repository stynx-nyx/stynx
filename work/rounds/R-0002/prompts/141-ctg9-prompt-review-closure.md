# CTG9 — prompt-review de fechamento técnico e despacho Architect

Você é Claude Code Opus 5.5, reviewer independente em modo **prompt-review**,
somente leitura. Leia na worktree `ctg-0009-preflight.md`, `plan.md`
§OD-S15-02/§Retomada, `reviews/ctg9-contract-review-7.json` e os prompts
`137-ctg9-sig-architect.md`, `138-ctg9-obx-architect.md`,
`139-ctg9-ofs-architect.md`. Confirme com código real de data/audit,
outbox, offline-sync, signature, health e SSE. A adenda A1 §8.1 no DETRAN
é somente leitura. Não execute Git, não edite nem despache workers.

OD-S15-03 incluiu os dez MUST da CTG9 na 1.5.0. Avalie se os quatro
bloqueios do review 7 estão contratualmente fechados:

1. Writers auditados em RR/SERIALIZABLE falham antes de ler cabeça, com
   `40001`, enquanto RC usa advisory e timestamp explícito monotônico.
   Cobrir T1 RR×T2 RC e SERIALIZABLE×RC. Índice da cabeça e sentinela NULL.
2. `audit.write` continua revogado ao app. Owner `AuditSqlSink` mantém
   tenant real; GUC local vincula a transação à primeira cadeia e recusa
   X→NULL ou X→Y antes de segundo advisory, com erro tipado.
3. Legado é classificado por `previous_hash` em linear, misordered, fork ou
   mismatch, sem rehash nem abortar upgrade por defeito antigo. Âncora de
   nova época preserva diagnóstico e tips; `verify_chain` não declara
   legado inválido conforme e valida a nova época. Mismatch existente no
   banco de release pede decisão Owner antes da publicação.
4. `txIndependent` ativa holder ALS estrito: em callback de domínio, toda
   tentativa de `Database.tx` que obteria outra conexão, mesmo via wrapper
   CLS e em qualquer papel, falha antes de `pool.connect`. Fora do modo
   estrito o legado CTG5 segue. `now()` SSE tem lock timeout/55P03→503,
   um preflight por tenant/processo fora do pool, e append sela escrita
   posterior (appendMany para múltiplos eventos).

Depois julgue se os três prompts Architect são despacháveis **em paralelo**
sem lock comum, cobrem A1 e mantêm papéis separados. PASS aqui libera apenas
o trabalho Architect; Inspector e Engineer exigem seus próprios prompts,
sensores e delivery-review. Se houver bloqueio, dê sequência concreta e
reparo mínimo. Retorne um único JSON válido sem cerca Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
