# CTG-0009 — revisão técnica condicional da adenda A1

Você é o reviewer independente Claude Code Opus 5.5. Faça revisão **somente
leitura** da worktree STYNX entregue como quarto argumento da ponte. Leia
`work/rounds/R-0002/ctg-0009-preflight.md`, a especificação DETRAN
`work/campaigns/C-0002-stynx-upstream-spec.md` §§6.11–6.13 e 8.1 (repositório
DETRAN somente leitura), e o código atual de `packages/signature`,
`packages/health`, `packages/outbox`, `packages/offline-sync`, `packages/data`
e `packages/backend` SSE. Confronte também `AGENTS.md`, `law/constitution.md`
e `docs/meta/development-contract.md`. Não edite arquivos nem execute Git.

Esta é uma **prévia condicional**, não a autorização de escopo ou um
prompt-review que libera workers. A OD-S15-01 inclui SIG/OBX/OFS se a adenda
confirmar; A1 confirmou os dez IDs como MUST para o consumidor. A OD-S15-02
nomeia um único gate final após CTG8. O Owner ainda decidirá explicitamente
se esses IDs entram na STYNX 1.5.0. Avalie a qualidade técnica do preflight
para permitir preparar contratos em paralelo sem alterar produto. Não presuma
a decisão do Owner nem declare a release conformante.

Procure, sobretudo, lacunas que tornariam um contrato posterior inviável ou
inseguro: prova de nível/capacidade/evidência de assinatura sem backend
simulado apto; vínculo e bytes canônicos dos manifestos; append de fatos
separado da intenção de despacho; ordenação de cursor sob commits fora de
ordem; ACK/ledger com correlação de evento e tenant; migração sem perda;
política de TTL por tenant/órgão; recibo e sequência de lote offline;
aplicação atômica por item com resultado parcial; detecção e resolução de
conflitos; RLS real com dois tenants; compatibilidade HTTP e envelopes
existentes; locks compartilhados e ordem de integração. Diferencie decisão
Architect que pode ser fixada já de decisão de produto que requer Owner.

Retorne apenas um objeto JSON válido:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
PASS significa que a prévia é suficiente para **preparar contratos e prompts
condicionais**, não que workers possam ser despachados ou a CTG9 entre no
escopo. REVIEW identifica reparos técnicos; FAIL identifica conflito real de
autoridade ou contrato que exige escalada. Sem cercas Markdown.
