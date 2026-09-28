# Prompt-review externo — CTG-0007, ciclo 3 excepcional

Owner decision 2026-09-27: explicitly authorized the exceptional third prompt-review for CTGs 4–8 in this R-0002 session. This supersedes earlier pending-exception checkpoints. Inspector and Engineer dispatch still require an Opus PASS and all predecessor gates.

Você é o reviewer **Claude Code Opus 5.5**, família distinta da Codex executora. Modo `prompt-review`. Este prompt está **preparado, não autorizado para despacho**: o limite de dois `REVIEW` foi atingido e o Owner deve conceder exceção explícita antes de qualquer execução. Quando autorizado, faça somente leitura nesta worktree e no DETRAN; não edite, não execute Git mutante e não despache workers.

Leia os pareceres `work/rounds/R-0002/reviews/ctg7-prompt-review-1.json` e `ctg7-prompt-review-2.json`. Reavalie `docs/framework/contracts/utilities-1.5.md`, `work/rounds/R-0002/ctg-0007-plan.md` e prompts `80`–`83` com foco nos reparos do ciclo 2. Compare com `packages/tenancy/src/tenant-context.interceptor.ts`, `packages/tenancy/src/utils.ts`, `packages/core/src/request-context.interceptor.ts`, `docs/framework/contracts/tenancy-context-1.5.md`, `packages/auth/src/stynx-auth.guard.ts`, `packages/backend/src/auth/auth-context.guard.ts`, C-0002 §6.7–6.9/§7/§8, código de consumidor DETRAN apenas para leitura e contrato CTG5 UPS-TXN-03.

Verifique concretamente:

1. O guard limpa todos os campos de identidade anteriores na entrada. Após HMAC e replay, `onVerified` preenche `stynxClaims.sub` e `.tenantId` a partir de dados assinados ou mapeamento confiável. Na rota `@Public()` comum, tenancy seleciona header antes da claim, usa claim antes do bearer não verificado e prioriza claim para ator. Confirme que o contrato/prompt 80 exigem: sem header, tenant/ator HMAC no `RequestContext`; header divergente, 403 `TENANT_ACCESS_DENIED`; bearer forjado divergente não muda tenant/ator; membership ausente falha; webhook tenant-scoped não é montado em `OPTIONAL_TENANCY_PATHS`. Distinga o marcador de proveniência do CTG1, que só governa `@PublicTenantRoute`, desta rota comum. Não aceite como prova `request.principal`/`tenantId` isolados.
2. Formato timestamp fixo de dez dígitos, nomes de header configurados buscados em minúsculas, array e whitespace recusados com razão estável. Confira que nenhum array usa primeiro elemento.
3. `businessDays` exige inteiro seguro entre 0 e 366; negativos, frações e NaN têm erro tipado e sensores no prompt 81.
4. A rejeição de propriedades `undefined`/função/símbolo no Angular é uma política explícita apesar de `JSON.stringify` omiti-las; o plano §7 registra também a diferença de ordenação ponto de código/UTF-16 e impacto nas chaves em voo; prompt 82 tem vetores correspondentes. Confirme que a reconciliação CTG5 continua condicionando 7C.

Confronte a prosa com o código real e os vetores de consumidor. Marque `REVIEW` com reparo concreto para lacuna corrigível; `FAIL` para incompatibilidade fundamental. Responda com um único objeto JSON válido, sem Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

`PASS` aprova apenas contrato e prompts; não despacha Inspector, não autoriza publicação e não remove a dependência CTG5 de 7C.
