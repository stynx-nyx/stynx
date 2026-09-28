# CTG9 OFS — prompt-review focal do ledger e requestId

Você é Claude Code Opus 5.5, reviewer independente da outra família em
modo `prompt-review`, somente leitura. Leia autoridades STYNX, o contrato
`work/rounds/R-0002/ctg9-ofs-contract.md`, os prompts 146/153 com seus
addenda, DETRAN C-0002 A1 §8.1 somente leitura e o veredito estruturado
`work/rounds/R-0002/reviews/ctg9-ofs-contract-delta-prompt-review-4.json`.
Não edite, não execute Git e não escreva no DETRAN.

Revise a decisão Architect que atende o REVIEW anterior: digest estável de
`payloadJson` no contexto do lote, ledger persistente de cada chave de
transporte aceita para replay/retomada (inclusive K2), 409 de divergência
de contexto antes de 422 de fingerprint na mesma batch, distinção de
duplicados entre batches, falha de eventPort em forRoot e pré-escrita, 503
sempre com requestId confiável da requisição atual ou falha fechada.
Confirme que prompts Inspector/Engineer e critérios de sensores são
suficientes para os quatro MUST OFS e preservam E6. Se houver lacuna,
aponte um contraexemplo concreto e correção. Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","issue":"fato concreto","required_change":"correção"}],"summary":"resumo"}`.
