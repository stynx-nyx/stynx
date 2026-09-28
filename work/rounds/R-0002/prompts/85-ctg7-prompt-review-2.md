# Prompt-review externo — CTG-0007, ciclo 2

Você é o reviewer **Claude Code Opus 5.5**, família distinta da Codex executora. Modo `prompt-review`. Faça somente leitura nesta worktree e no DETRAN; não edite, não execute Git mutante e não despache workers.

Leia `work/rounds/R-0002/reviews/ctg7-prompt-review-1.json` e reavalie `docs/framework/contracts/utilities-1.5.md`, `work/rounds/R-0002/ctg-0007-plan.md` e prompts `80`–`83` após o reparo. Compare com STYNX `AGENTS.md`, `docs/meta/development-contract.md`, `docs/framework/contracts/tenancy-context-1.5.md`, código atual de worklist/tenancy, o draft CTG5 `docs/framework/contracts/transactional-audit-idempotency-1.5.md` na worktree CTG5 e DETRAN `work/campaigns/C-0002-stynx-upstream-spec.md` §6.7–6.9, §7, §8 e OD-S15-01.

Confira cada achado do ciclo 1, em especial:

1. Timestamp em segundos versus `nowMs`, janela inclusiva e expiração em ms com exemplo numérico; replay key a partir de HMAC recomputado, insensível à caixa do header, e todos os campos de identidade usados por `replayKey`/`onVerified` assinados.
2. Guard HTTP com statuses fechados, entrada `@Public()` com tenancy/core, membership do ator técnico, ausência de confiança em header isolado, configuração única explícita e desvio bare hex do DETRAN.
3. Calendário incluindo o dia do vencimento via primeiro instante do dia seguinte, zero retornando `startAt`, integração `resolveWorklistDeadline`, relógio fornecido ao worklist e limites de varredura/feriado válido.
4. Angular com tipo de corpo e content type definidos, `action`/`target` e chave limitados, `crypto.subtle` ausente tipado, SSE por Accept, provider opt-in único, `withInterceptorsFromDi` e vetores JSON compatíveis com as regras estritas CTG5. Confirme a distinção entre chave de corpo Angular e fingerprint completo do servidor.
5. Prompts Inspector capazes de provar as decisões acima; 7A com dois apps e store compartilhado; 7C retido até PASS CTG5; plano com conformidade §7, docs de pacote e nota de migração.

Trate uma lacuna ainda ambígua como `REVIEW` com reparo concreto. Não aceite uma asserção apenas porque repete a prosa: confronte-a com o consumidor, a API worklist e o draft CTG5. Responda com um único objeto JSON válido, sem Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

`PASS` aprova contrato e prompts condicionalmente; Inspector 7C ainda depende do checkpoint CTG5 no plano. `REVIEW` é lacuna corrigível; `FAIL` é incompatibilidade fundamental.
