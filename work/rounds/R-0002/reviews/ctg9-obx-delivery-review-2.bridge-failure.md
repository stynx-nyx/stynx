# Ponte Claude — falha de formatação no delivery-review OBX 2

A ponte DETRAN foi chamada com `claude claude-opus-5-5`, prompt 166,
veredito OBX 2 e a worktree STYNX. Saiu com código 4 porque o reviewer
devolveu JSON cercado por Markdown, não o JSON puro exigido pela ponte.
O mesmo prompt foi submetido a `claude -p --model claude-opus-5-5
--permission-mode plan` com `--output-format json --json-schema`.
O resultado estruturado adjacente governa a triagem: PASS limitado
ao snapshot observado, com sensores e riscos não bloqueantes antes da
conformidade. A resposta não estruturada da ponte apontou dois problemas
de persistência que já estavam em reparo durante o fallback. O DETRAN
permaneceu somente leitura.
