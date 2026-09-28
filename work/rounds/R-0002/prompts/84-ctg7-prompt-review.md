# Prompt-review externo — CTG-0007

Você é o reviewer **Claude Code Opus 5.5**, família distinta da Codex executora. Modo `prompt-review`. Faça somente leitura nesta worktree e no DETRAN; não edite, não execute Git mutante e não despache workers.

Avalie `docs/framework/contracts/utilities-1.5.md`, `work/rounds/R-0002/ctg-0007-plan.md`, prompts `80`–`83`, STYNX `AGENTS.md`/`docs/meta/development-contract.md` e DETRAN `work/campaigns/C-0002-stynx-upstream-spec.md` §6.7–6.9, §7, §8 e OD-S15-01. Confirme símbolos e package boundaries contra o código atual. Verifique sobretudo:

1. Cobertura de **todos** UPS-HOOK-01…02, UPS-CAL-01…02, UPS-NGIDEM-01 como MUST, com provas negativas, E2E Nest e Angular `HttpTestingController`.
2. HMAC de bytes brutos, timestamp, janela, replay atômico multi-instância, ordem autenticar→reservar e fail-closed; nenhuma identidade de tenant ou principal sem autenticação e fronteira `integration-adapter` puro versus guard `backend`.
3. Calendário com data civil por fuso e DST, feriados exclusivamente do consumidor e compatibilidade com `WorklistBusinessCalendar`; clock realmente injetável.
4. Interceptor Angular estritamente opt-in, forma exata `Idempotency-Key`, retry, JSON canônico alinhado a UPS-TXN-03 de CTG5. Aponte qualquer ambiguidade de chave/hash antes de Inspector.
5. Separação de papéis/locks, mudanças de manifesto e lockfile, baselines/trace, changeset grupo fixo, READMEs, CI e ausência de escrita DETRAN ou edição manual gerada.

Responda com um único objeto JSON válido, sem Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

`PASS` aprova o contrato e os prompts condicionalmente; o Inspector 7C continua bloqueado até o checkpoint explícito do CTG5. `REVIEW` indica lacuna corrigível; `FAIL` indica incompatibilidade fundamental.
