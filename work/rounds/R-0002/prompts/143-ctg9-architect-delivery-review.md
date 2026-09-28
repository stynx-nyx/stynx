# CTG9 — delivery-review dos contratos SIG, OBX e OFS

Você é Claude Code Opus 5.5, reviewer independente e somente leitura.
Na worktree, leia `ctg-0009-preflight.md`, os contratos
`ctg9-sig-contract.md`, `ctg9-obx-contract.md`, `ctg9-ofs-contract.md`,
os ADRs SIGNATURE-0001, OUTBOX-0002, MOBILE-OFFLINE-0002 e os contratos
públicos editados sob `docs/framework/contracts/`. Confronte com os dez
MUST da adenda A1 §8.1 do DETRAN em modo somente leitura e com o código
real atual. Leia os reviews CTG9 técnico 7, prompt-review closure 1 e
delta 2. Não execute Git, não edite nem despache workers.

Critério: os contratos Architect precisam ser completos, coerentes e
implementáveis sem regressão pública, sem atribuir conformidade ao código
atual. Verifique autoridade Art. 6, preservação de `INV-OFFLINE-001`,
resolução aditiva dos ADRs anteriores e ausência de limite novo não
autorizado. SIG precisa exigir prova criptográfica independente do
provedor, readiness real e vínculo de manifestos/retirada. OBX precisa
preservar legado e migração sem perda/redespacho, auditoria por época,
ordem de cursor sob commit, RLS, lease/ACK, e compor append genérico
com CTG5 enquanto o selo estrito OFS é explícito. OFS precisa manter
rotas/status/envelopes, lote legado e >100 itens, identidade e recibo,
item transacional com rollback/partial, numeração e handoff.

Se uma transação, migração ou prova proposta for impossível ou produzir
uma sequência concreta de perda, duplicação indevida, deadlock sem retorno,
tenant leak, assinatura falsa ou regressão CTG5, marque REVIEW/FAIL e diga
o reparo mínimo. PASS libera prompts Inspector; não atesta implementação.
Retorne um único JSON válido sem Markdown:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
