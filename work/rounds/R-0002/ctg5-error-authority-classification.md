# CTG5 — classificação Architect da correção do envelope

**Papel:** Architect. **Decisão:** aplicar a opção A de
`ctg5-error-envelope-option-a.md` apenas às rejeições próprias da nova
fronteira `@TransactionalCommand`. É uma correção de conformidade **não
quebrante** para `law/schemas/error-envelope.schema.json` existente, sob a
autorização da campanha OD-S15-01/02. Não atribuo ao Owner uma escolha que
ele não declarou.

`INV-ERROR-001.change_policy` rege mudanças do invariante e da semântica
governada. Esta correção não altera `law/`, o schema ou os corpos publicados.
`git ls-tree` dos tags `@stynx-nyx/backend@1.5.0-rc.1` e
`@stynx-nyx/backend@1.5.0-rc.2` não encontrou
`packages/backend/src/transactional-command/**`; `rc.3` permanece local.
O contrato Architect antigo que descrevia 409 `{code,context}` era
incompatível com o schema superior e foi emendado antes dos novos testes.
UPS-TXN-03 exige 409 com código configurável, mas não fixa o formato do
corpo. O código configurável continua disponível sob o padrão já publicado
do `errorCode`.

O Opus retornou PASS de classificação em
`reviews/ctg5-error-authority-classification-review-1.json` por fallback
estruturado após a ponte rejeitar JSON cercado por Markdown. Esse review é
evidência técnica, não substitui uma autorização do Owner quando ela for
exigida. A autorização geral do Owner permite executar o trabalho, mas não
equivale à aprovação de uma mudança quebrante ou de uma exceção ADR. Se a
implementação exigir mudança no schema, no catálogo legado, em
`StynxErrorFilter`/`StynxDataError`, no 422 legado ou nos bytes de resposta
escolhidos pelo consumidor, a tríade para e pede decisão Owner específica.

Antes do despacho Inspector, devem existir neste branch: contrato CTG5,
catálogo `errors.json`, nota de migração, prompts 105/106 revisados e PASS de
prompt-review independente. Inspector fortalece os testes legados sem
enfraquecê-los; Engineer toca só a nova fronteira. Trace e API baselines
continuam commits Architect separados. O único CI completo, PR, CI remoto
e publicação final continuam no gate consolidado OD-S15-02.
