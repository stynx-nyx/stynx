# CTG9 SIG — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e as autoridades na ordem exigida, o contrato
`ctg9-sig-contract.md`, `docs/framework/contracts/signature.md` e A1 §8.1
do DETRAN somente leitura. Escreva **somente testes e fixtures de teste**
sob `packages/signature/test/**`; não altere `src`, docs, law, generated,
baselines ou outros pacotes. Não execute Git, commit, push nem PR.

Codifique sensores UPS-SIG-01…04 antes da implementação:

- Mínimo ADVANCED/QUALIFIED no pedido/resultado, nível inferior e claim
  falso do backend, ausência de backend/profile/verifier, documento/CMS/
  certificado/TSA/OCSP/CRL adulterados, cadeia/qualificação não confiável,
  tempo epoch zero, timeout e backend mock. Use uma PKI de teste real para
  exercitar o verificador criptográfico entregue pelo STYNX (CMS/PAdES
  ByteRange, cadeia X.509, OID, token RFC 3161, OCSP e CRL assinados);
  não aceite double da porta nem resposta do provedor como prova regulada.
  Teste `expectedManifestSha256` contra o manifesto vinculado no resultado.
  Em produção, verificador sem marca interna e sem reconhecimento
  `consumerOwnedVerifier` falha no bootstrap; marca estrutural forjada falha.
  Caminho reconhecido registra `verifierKind:'consumer-owned'` sem atribuir
  verificação STYNX ao provedor.
  Preserve negativos clínicos/juntas e regressão da API legada.
- Readiness tipada: presença e ausência individual de PAdES, TSA, LTA,
  OCSP/CRL, perfil compatível, simulado em produção, indicador ausente,
  health down; sem dependência health→signature.
- Manifestos sessão/lote: vetores RFC 8785, bytes e hash do documento,
  tenant, snapshot, ID, versão, ordem e cardinalidade de signatários,
  PAdES/certificado/instante/prova de cada um, adulterações isoladas,
  ausência de evidência, época zero e falha de confiança.
- Retirada física/digital: vínculo tenant/caso/documento/hash/parte,
  atestador confiável, prova válida, adulterada, indisponível e conjunto
  completo de campos da porta `verifyWithdrawalEvidence`.

Os sensores devem exercer comportamento observável com doubles/fixtures
explícitos; uma falha de import por símbolo ausente não substitui o vermelho
de cada critério. Rode os testes focais, registre vermelho esperado por requisito sem
enfraquecer sensores existentes. Se uma API proposta for impossível,
descreva a incompatibilidade em vez de inventar shim. O maestro fará o
rebind de trace e o commit Inspector.
