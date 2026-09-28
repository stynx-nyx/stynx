# CTG5 envelope — classificação da autoridade antes do despacho

Você é o reviewer independente Claude Code Opus 5.5, somente leitura.
Examine a worktree STYNX entregue à ponte, `law/constitution.md`,
`law/invariants/INV-ERROR-001.json`,
`law/schemas/error-envelope.schema.json`,
`docs/framework/contracts/errors.json`, o código/testes CTG5 e
`work/rounds/R-0002/ctg5-error-envelope-option-a.md`. Não edite arquivos
nem execute Git.

O código de `@TransactionalCommand` da CTG5 é novo na branch da release e
não foi publicado em uma versão estável nem em RC. A opção A substitui as
rejeições **novas** dessa fronteira por corpos conformes ao schema vigente,
sem editar `law/` ou mudar os corpos legados de data/idempotency nem as
respostas escolhidas pelo consumidor. O Owner já autorizou nesta sessão
“quaisquer ações necessárias para prosseguir até a completa finalização” e
“todas as ações ainda eventualmente necessárias”, mas não escolheu
explicitamente entre opção A e ADR para este conflito. O plano anterior
tratou `INV-ERROR-001.change_policy.human_approval_required` como exigência
de recibo específico antes de qualquer sensor/implementação.

Classifique estritamente a autoridade aplicável: (1) essa correção de código
novo para obedecer ao schema existente é uma **mudança do invariante/contrato
público publicado** que exige uma escolha Owner específica sob
`INV-ERROR-001`, ou é uma correção não quebrante que o Architect pode fixar
sob a autorização de campanha? (2) O campo `human_approval_required:true`
vale para toda implementação tocando a área de erro ou apenas para mudança
da semântica governada? (3) A autorização geral do Owner já presente conta
como aprovação humana suficiente se houver quebra? (4) Qual evidência
mínima deve existir antes do Inspector e do Engineer, sem atribuir ao Owner
uma escolha que ele não fez? Diferencie aprovação para agir de escolha
semântica. Não proponha alterar o schema para acomodar `{code,context}`.

Retorne só JSON válido:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"classificação e próxima ação"}`.
PASS significa que a opção A pode ser contratada e testada como correção
não quebrante sem recibo de escolha Owner; REVIEW significa que falta uma
decisão/recibo específico ou maior precisão; FAIL indica conflito de
autoridade sem reparo. Seu veredito não substitui o Owner.
