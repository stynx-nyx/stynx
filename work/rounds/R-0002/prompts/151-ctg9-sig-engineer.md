# CTG9 SIG — Engineer implementation task

Declare `Engineer` na primeira linha. Trabalhe na worktree cumulativa
indicada pelo maestro. Leia `AGENTS.md` e as autoridades na ordem vinculante,
`ctg9-sig-contract.md`, `docs/framework/contracts/signature.md`,
ADR-SIGNATURE-0001 e os sensores Inspector CTG9 commitados. DETRAN A1 §8.1
é somente leitura. Escreva somente `packages/signature/src/**` dentro do
write set; o maestro possui Git, manifests/lockfile, changesets, baselines,
trace, README gerado e gates compartilhados. Não execute Git, commit, push,
PR ou escrita no DETRAN. Não altere testes nem faça shim/cópia DETRAN.

Implemente UPS-SIG-01…04 até os sensores passarem:

- `createCmsTrustVerifier` concreto sob STYNX: PAdES ByteRange e digest
  efetivamente assinados, CMS signed attributes, cadeia X.509 até âncoras
  injetadas e política OID, token RFC 3161 com assinatura/imprint/tempo,
  OCSP/CRL assinados com status e freshness. Use as dependências já
  instaladas `pkijs`, `asn1js`, `@peculiar/x509`. Resultado de provedor não
  é veredito; ausência/indisponibilidade falha fechada. Perfil de produção
  exige brand privada do factory ou `consumerOwnedVerifier` reconhecido,
  com `verifierKind` verdadeiro em prova/evidência/readiness.
- Gate opt-in de `minimumSignatureLevel` em sign/verify, preservando API
  legada sem mínimo; backend mock/sintético/local-clock nunca estabelece
  ADVANCED/QUALIFIED. Erros tipados e sem vazamento de segredo.
  Cubra a matriz de perfis ADR-0018 (PAdES-B-LT+TSA, OCSP/CRL,
  QUALIFIED) e os negativos clínicos/juntas via erros tipados do contrato
  SIG, sem importar código do DETRAN.
- Readiness com capacidades PAdES/TSA/LTA/OCSP/CRL e composição health
  signature→health com witness/guard de bootstrap em produção.
- Manifestos sessão/lote RFC 8785 com vínculo assinado de hash esperado,
  artefato, signatários na ordem e evidência de cada um; verificação de
  retirada física/digital preservando os campos da porta consumidora.

Use os testes Inspector como critérios, rode suite focal, lint e typecheck
signature. Corrija somente produção dentro do write set; se um sensor for
impossível ou contraditório, reporte ao maestro com contraexemplo para
triagem Architect/Inspector, sem enfraquecê-lo. Reporte símbolos reais,
arquivos, testes verdes e lacunas residuais. O maestro fará o commit Engineer.
