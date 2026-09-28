# CTG9 SIG — delivery-review ciclo 5, xref e revogação

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`,
`law/adr/ADR-SIGNATURE-0001-trust-evidence.md`, o contrato
`work/rounds/R-0002/ctg9-sig-contract.md`, a adenda A1 §8.1 DETRAN
C-0002 (somente leitura), e os vereditos SIG 1–4 em `reviews/`.
Examine a fonte congelada em `packages/signature/src/**` e os sensores
Inspector/fixtures em `packages/signature/test/**`. Não edite arquivos,
não execute Git e não escreva no DETRAN.

O ciclo 4 resolveu CMS detached, identidade do manifesto e frescura
pós-TST, mas falhou na semântica efetiva de xref. Confirme que todo alvo
de xref final é parseado no seu offset real, o catálogo é comparado
com o objeto efetivo, os limites de stream seguem `/Length` e nenhum
objeto sombreado em stream ou string literal passa. Confirme que trailer
é dicionário real, rejeita duplicatas, `/XRefStm` híbrido e xref streams
não suportados, mantém `/Prev` igual ao startxref assinado e preserva
`/Root`, `/Encrypt`, `/Info`. Exercite os negativos de catálogo
reapontado, stream falso, híbrido tipo 1/2 e `/Prev` duplicado. Verifique
também CRL/OCSP revogados após TST, fallback de evidência antiga para
fresca, política de âncoras TSA, classificação de sintético inválido e
o vínculo de retirada pelo catálogo do prefixo assinado aceito na
emenda Architect. Classifique lacunas de fixture separadamente de
defeitos. PASS libera apenas commit SIG, não conformidade/publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
