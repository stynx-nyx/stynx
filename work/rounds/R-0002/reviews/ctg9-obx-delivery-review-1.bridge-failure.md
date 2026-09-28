# Ponte Claude — falha de formatação no delivery-review OBX 1

A ponte DETRAN foi chamada com `claude claude-opus-5-5`, prompt 163,
veredito OBX 1 e a worktree STYNX. Saiu com código 4 porque o reviewer
devolveu JSON cercado por Markdown, seguido de prosa. O mesmo prompt foi
submetido a `claude -p --model claude-opus-5-5 --permission-mode plan`
com `--output-format json --json-schema`; o resultado estruturado
adjacente governa a triagem. O bridge relatou REVIEW por cerca de
tentativa/lease ausente, cópia histórica incompleta e waits sem prazo.
O DETRAN permaneceu somente leitura.
