# CTG9 SIG — delivery-review ciclo 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`,
`docs/meta/development-contract.md`,
`law/adr/ADR-SIGNATURE-0001-trust-evidence.md`,
`docs/framework/contracts/signature.md`,
`work/rounds/R-0002/ctg9-sig-contract.md`, DETRAN C-0002 A1 §8.1
somente leitura, o FAIL estruturado
`reviews/ctg9-sig-delivery-review-1.json`, os testes/fixtures Inspector
do commit `c8900429` e a implementação atual não commitada em
`packages/signature/src/**`. Não edite arquivos, não execute Git e não
escreva no DETRAN.

Reavalie todos os bloqueios do ciclo 1 contra código e sensores reais:
nível PAdES **derivado** de SubFilter CAdES, signingCertificateV2,
timestamp RFC3161 embutido com imprint da assinatura e DSS/VRI DER
assinado/fresco; ByteRange ISO incluindo delimitadores de `/Contents`,
prefixo original coberto e padding zero; mínimo efetivo request+perfil;
retirada por declaração canônica separada assinada, hash no campo
`/STYNXWithdrawalSHA256` coberto, resolução party→cert e CMS de
evidência; indisponível distinto de inválido; manifesto persistível;
readiness freshness, `verifierKind`, integração real de health.
Confira cadeia com intermediária/issuer real e LTA=false fail-closed.
Verifique que fixture B-B/B-T é recusada sob B-LT, source não relacionado
é recusado e assinatura original não serve para retirada. Aponte lacunas
MUST remanescentes com arquivo/linha e reparo específico. Diferencie
falhas bloqueantes de limitações de consumidor (âncoras/matriz próprias).

PASS libera apenas commit da fonte SIG, não publicação. Responda JSON
puro: `{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.
