# CTG9 OFS — prompt-review focal do delta após delivery-review 4

Você é o reviewer Claude Code Opus 5.5, da outra família. Modo `prompt-review`.
Leia, somente na worktree, `work/rounds/R-0002/ctg9-ofs-contract.md`, o
veredito `work/rounds/R-0002/reviews/ctg9-ofs-delivery-review-4.bridge.json`,
os prompts 146 e 153, e a fonte/testes OFS necessários. Não edite arquivos,
não execute Git e não escreva no DETRAN. Avalie especificamente as decisões
Architect posteriores ao review 4: (1) mesma batch/contexto com nova chave
de transporte faz replay mesmo se fingerprint diverge; mesma chave com corpo
alterado dá 422; (2) `duplicateItems` conta apenas duplicados entre batches;
(3) applier sem eventPort falha antes da primeira escrita; (4) 503 usa ID
confiável da requisição atual. Verifique coerência com E6, idempotência,
requisitos MUST e provas Inspector. Responda JSON puro com `verdict`
(`PASS`, `REVIEW` ou `FAIL`), `findings` e `summary`. `REVIEW` deve conter
correção concreta; `FAIL` exige violação fatal demonstrada.
