# CTG9 SIG e OBX/data — prompt-review Engineer antecipado

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia os contratos CTG9 SIG e OBX,
ADRs, a adenda DETRAN A1 §8.1 somente leitura, os prompts Engineer
151–152 e os sensores Inspector SIG/OBX no commit `314d6ba6`. Leia
`AGENTS.md`, `docs/meta/development-contract.md` e as decisões
OD-S15-02/03 em `plan.md`. Não execute Git nem edite arquivos.

Este review libera **somente** os dois Engineers SIG e OBX/data para
write sets disjuntos: `packages/signature/src/**` contra
`packages/data/src/**`, migration data ≥0021,
`packages/outbox/src/**`, `packages/audit/src/**` e
`packages/backend/src/**`. O Inspector OFS ainda corrige sensores e o
Engineer OFS não é despachado neste gate. O maestro faz Git, migration
compartilhada, manifests, changesets, baselines, trace e gates. O rebind
de `law/trace.json` ocorrerá depois do commit Inspector OFS, antes do
gate de release; o atraso não autoriza mudar ou omitir testes.

Confirme que 151 e 152 cobrem UPS-SIG-01…04 e UPS-OBX-01…02,
respeitam as provas vermelhas, tenancy/RLS, CTG5 e SSE, não exigem API
impossível nem lock comum e proíbem Git/DETRAN/testes enfraquecidos.
Se faltar contrato ou sensor essencial, marque REVIEW com o menor reparo.
PASS libera apenas o despacho em paralelo desses dois Engineers; não
atesta implementação, delivery ou publicação. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
