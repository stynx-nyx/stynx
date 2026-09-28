# CTG5 envelope — prompt-review de despacho após REVIEW

Você é o reviewer independente Claude Code Opus 5.5, somente leitura. Revise
o HEAD da worktree STYNX entregue à ponte, incluindo os prompts Inspector
105 e Engineer 106 fixados no commit
`921d358ac3ee621deb93d197a76d54137eacf0be`, o contrato,
catálogo, nota de migração, classificação Architect e o review anterior
`reviews/ctg5-envelope-worker-prompt-review-3.json`. Não edite arquivos
nem execute Git. Confira os bytes dos prompts contra os digests:

- Inspector 105: `d920a722fcca5fbb110284e40bb56c85f794745778aef86b72b41bf0a9d0c6fe`
- Engineer 106: `2380b6caf9085f74821c6463709f457743d10e36ced34f9c4e700773ad76e9af`

Verifique os cinco achados do ciclo 3: prompts não dependem do PASS antigo
review-2 nem de recibo Owner fictício; exigem um binding com PASS atual e
SHA-256 do texto de cada prompt; o Inspector pode substituir **apenas** as
asserções antigas de 409 por envelope completo e preserva 412/428, 422,
502, RLS e controles duráveis; o contrato não usa o nome antigo
`IDEMPOTENCY_KEY_IN_PROGRESS` na prova de audit contention; e o catálogo
fixa o corpo legado 422. Verifique também se o catálogo e os prompts cobrem
os códigos CTG5 sem estender a mudança a `StynxErrorFilter`, data ou corpos
do consumidor, e se a referência `a3c81645` no contrato está claramente
histórica. A revisão só libera a tríade da correção não quebrante; o único
gate completo continua no final da OD-S15-02.

Retorne apenas JSON válido:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
PASS libera o Maestro a gravar o binding/digests e despachar Inspector;
REVIEW exige reparo; FAIL aponta conflito irrecuperável.
