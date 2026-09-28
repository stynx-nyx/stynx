# CTG9 SIG — Inspector sensor task

Declare `Inspector` na primeira linha. Use a worktree cumulativa indicada
pelo maestro. Leia `AGENTS.md` e as autoridades na ordem exigida, o contrato
`ctg9-sig-contract.md`, `docs/framework/contracts/signature.md` e A1 §8.1
do DETRAN somente leitura. Escreva **somente testes e fixtures de teste**
sob `packages/signature/test/**`; não altere `src`, docs, law, generated,
baselines ou outros pacotes. Não execute Git, commit, push nem PR.
O maestro já instalou `pkijs`, `asn1js`, `@peculiar/x509` e
`@stynx-nyx/health` e adicionou alias de health no Vitest em `c21ba672`.
Gere a PKI de teste em `test/fixtures/pki/**` com essas bibliotecas ou
`openssl`; fixtures e eventual script gerador ficam dentro de `test/**`.
Nenhum vermelho pode ser somente `MODULE_NOT_FOUND`.

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
  Reproduza com fixtures STYNX os negativos clínicos/juntas de
  `ctg9-sig-contract.md`: hash de recibo divergente, artefato/hash
  malformado, storage ID ausente, formato errado, TSA ausente, estado
  revogado/desconhecido, configuração/token ausente, HTTP falho e timeout;
  confira erro tipado de cada um. Cubra a matriz ADR-0018: PAdES-B-LT
  com TSA, OCSP-only, CRL-only, fallback permitido, QUALIFIED exigido,
  perfil ausente/não suportado. Preserve regressão da API legada.
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
Não importe nem copie código DETRAN; mapeamento HTTP dos erros tipados e
paridade final pertencem ao consumidor nas R-0022…R-0024.
