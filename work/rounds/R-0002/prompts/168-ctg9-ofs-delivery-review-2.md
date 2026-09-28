# CTG9 OFS — delivery-review ciclo 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, o
`docs/meta/development-contract.md`, o contrato
`work/rounds/R-0002/ctg9-ofs-contract.md`, os ADRs de offline sync,
a adenda A1 §8.1 da especificação DETRAN C-0002 (somente leitura),
`reviews/ctg9-ofs-delivery-review-1.json`, a migration 0002, a
implementação em `packages/offline-sync/src/**` e os sensores Inspector
em `packages/offline-sync/test/**`. Não edite arquivos, não execute Git,
não escreva no DETRAN.

Reavalie os oito bloqueios do ciclo 1: concorrência entre lotes de mesma
chave com recibo atômico e conflito 23505 controlado; tentativa de hash
divergente persistida; lease SQL renovado e cercado em cada escrita;
rejeição terminal versus lote aberto em falha interna/40P01/503;
numeração por status, entidade e série e liberação da cauda local no
cancelamento; projeção de número bloqueado/expirado; ponte E6 para
linhas posteriores à migration 0002; rota sob prefixo global. Inspecione
também o recibo consultável por um lote duplicado de outro lote, o
envelope completo em replay, papéis PostgreSQL reais e composição com
CTG5. Separe defeitos de código de lacunas de sensores. PASS libera
somente o commit da fonte OFS; não atesta conformidade/publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
