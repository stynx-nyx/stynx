# CTG9 OFS — prompt-review focal 2, oráculo de numeração e recibos

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`, a adenda A1 §8.1 DETRAN C-0002
(somente leitura), `work/rounds/R-0002/ctg9-ofs-contract.md`, o prompt
Engineer 153, o prompt Inspector 146 e
`reviews/ctg9-ofs-contract-delta-prompt-review.json`. Examine os
sensores Inspector em `packages/offline-sync/test/**`, sobretudo os
oráculos corrigidos em `ctg9-upgrade.integration.spec.ts` e
`ctg9-parity.spec.ts`. Não edite, não execute Git e não escreva no
DETRAN.

O parecer focal anterior foi FAIL por `sensor-error` de queueItemId
duplicado e `policy-issue` de reserva elegível/códigos. Confirme que o
recibo do segundo lote preserva seu queueItemId submetido e guarda
`context.originalQueueItemId`; chaves declaradas/sintéticas repetidas
no lote CTG9 falham com 400 antes de escrita, sem mudar E6. Revise a
tabela UPS-OFS-01: cobertura, ambiguidade, expiração/estado e já
aplicado têm códigos neutros distintos, status `rejected`/`conflict`,
contexto e mapeamento host explícitos; apenas `reserved` consome, com
`validUntil` comparado a `createdLocallyAt`. A reserva é travada na
mesma transação independente do item antes de efeito; close/settle
projetam available→expired e preservam claimed-locally/applied. O
`reservationId` opcional pode ser derivado pelo adaptador host de
dados confiáveis e valida escopo/range. Verifique a coerência dos
sensores sem enfraquecer a compatibilidade E6. PASS autoriza fechar os
sensores e fazer delivery-review OFS; não declara conformidade nem
publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
