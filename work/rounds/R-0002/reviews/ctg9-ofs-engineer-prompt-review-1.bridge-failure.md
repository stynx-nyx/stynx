# Ponte Claude — falha de formatação no prompt-review OFS Engineer 1

A ponte DETRAN foi chamada com `claude claude-opus-5-5`, prompt 161, verdict
`ctg9-ofs-engineer-prompt-review-1.json` e a worktree STYNX. Saiu com código
4 porque o reviewer devolveu JSON cercado por Markdown e prosa fora do objeto;
a ponte exige JSON puro. O mesmo prompt foi submetido a `claude -p` com
`--model claude-opus-5-5 --permission-mode plan --output-format json`
e `--json-schema`. O resultado estruturado é o arquivo JSON adjacente e
governa a triagem: REVIEW por dependência `supertest` ausente. Nenhuma
alteração no DETRAN foi feita.
