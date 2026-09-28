# CTG9 SIG — delivery-review ciclo 6, catálogo efetivo

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`,
`law/adr/ADR-SIGNATURE-0001-trust-evidence.md`,
`work/rounds/R-0002/ctg9-sig-contract.md`, a adenda A1 §8.1 DETRAN
C-0002 (somente leitura), o parecer
`reviews/ctg9-sig-delivery-review-5.json` e os pareceres 1–4 ali
referidos. Examine a fonte congelada em `packages/signature/src/**` e
os sensores em `packages/signature/test/**`. Não edite arquivos, não
execute Git e não escreva no DETRAN.

O ciclo 5 reproduziu em memória um catálogo com `/DSS` visto pelo parser
linear mas ausente do xref efetivo: `endobj1 0 obj`, catálogo omitido na
última seção e `1%comment\n0%comment\nobj`. Confirme que o catálogo
final precisa de entrada `in use` com offset após `revisionEnd`, que o
objeto nesse offset é parseado e comparado estruturalmente tanto ao
contexto quanto ao catálogo usado para DSS, e que nenhum objeto do
contexto fica sem xref final correspondente. Os dois negativos novos em
`xref-attacks.ts`/`trust-gate.spec.ts` devem falhar com
`Post-signature modification`; a suíte local passou 201/201, typecheck
e lint. Verifique que o reparo não reabre os desvios das revisões 1–5:
ByteRange/CMS, xref/trailer, revogação pós-TST, fallback de evidência,
âncoras TSA, manifesto e retirada. A cadeia TSA agora deve usar o
`genTime` autenticado. Separe lacunas de fixture de defeitos reais.
PASS libera apenas commit SIG; não declara conformidade/publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
