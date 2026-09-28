# CTG9 OFS — review focal do papel PostgreSQL

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Leia
`reviews/ctg9-ofs-sensor-delta-review-4.json`, o delta do teste
`packages/offline-sync/test/integration/ctg9-upgrade.integration.spec.ts`
após `728a7be3`, o contrato OFS e o prompt Engineer 153. Não execute Git
nem edite arquivos. A adenda DETRAN A1 §8.1 é somente leitura.

Confirme que a suíte principal realmente usa `stynx_app`/`stynx_reader`
sem superuser/BYPASSRLS, com preflight executado antes do erro esperado
pela falta de migration 0002, e que o applier conserva a asserção de
`current_user='stynx_app'`. Verifique o `40P01` SQL real pela mesma
transação e que os três reparos do review 3 continuam intactos. Um
setup vermelho **só** por 0002 ainda ausente é esperado; nenhum outro
oráculo impossível pode permanecer. PASS libera commit Inspector OFS e
prompt-review Engineer integrado, sem atestar implementação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
