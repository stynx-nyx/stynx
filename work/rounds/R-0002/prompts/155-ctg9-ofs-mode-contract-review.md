# CTG9 OFS — Architect compatibility boundary review

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia a adenda DETRAN A1 §8.1, os
testes E6 publicados de `packages/offline-sync/test/unit` e
`test/integration`, `ctg9-ofs-contract.md`, ADR-MOBILE-OFFLINE-0002,
`offline-sync-api.md`, os prompts Inspector 146 e Engineer 153, e o delta
Architect desde `ab4587ad`. Não execute Git nem edite arquivos.

O conflito concreto: E6 sem resolver deduplica por `(tenant,payload_hash)`
mesmo com outra chave e devolve 409 no segundo cancelamento; a paridade
DETRAN exige identidade por chave+hash e repetição terminal idempotente.
O contrato agora seleciona modo CTG9 quando
`OfflineSyncPolicyResolver` é configurado no bootstrap, preservando E6
sem resolver. Verifique se esse corte é implementável nas rotas e no
serviço, sem shim, sem enfraquecer testes E6, sem corpo de request capaz
de alternar modo, e se a adenda pode ser consumida inteira pelo DETRAN
com resolver/catálogo. Confirme que prompts/testes novos exercitam o modo
CTG9 e que as quatro rotas/status/envelopes E6 continuam válidos.

Se a seleção por resolver contradiz A1 ou alguma API pública, marque
REVIEW e dê o reparo mínimo. PASS libera o commit Inspector/Engineer
nessa fronteira; não atesta implementação. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
