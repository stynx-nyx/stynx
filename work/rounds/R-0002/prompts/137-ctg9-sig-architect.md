# CTG9 SIG — Architect worker

Declare `Architect` na primeira linha. Trabalhe somente em
`packages/signature/**`, `docs/framework/contracts/signature-api.md` e em
`work/rounds/R-0002/ctg9-sig-contract.md`. Não execute Git, não commite,
não faça push/PR, não altere DETRAN nem outros pacotes. O maestro controla
Git, baselines, trace, changeset e revisão.

Leia na ordem de `AGENTS.md`: README, constituições, ADRs, schemas e
development-contract; depois leia a adenda A1 §8.1 da especificação C-0002
no DETRAN somente leitura, a prévia `ctg-0009-preflight.md` e as APIs reais
de signature e health. Este despacho é apenas **contrato Architect**, sem
implementação nem testes Inspector.

Entregue contrato verificável para UPS-SIG-01…04, com nomes reais/novos
tipados e compatibilidade da API publicada: nível mínimo ADVANCED/QUALIFIED
no pedido/resultado, backend ausente/simulado/capacidade insuficiente em
fail-closed, política e evidência de cadeia ICP-Brasil/TSA/revogação que não
confie na autodeclaração, probe de prontidão tipada sem dependência inversa
health→signature, manifestos canônicos RFC 8785 para sessão e lote com
PAdES/certificado e instante real por signatário, verificação de retirada
vinculada ao documento e à autoria. O consumidor define perfis e trust
anchors. Defina negativos executáveis, incluindo adulteração de cada
vínculo, época zero, backend mock e presença/ausência por capacidade.
Não crie assinatura CMS simulada como prova de produção. Relacione cada
critério A1 com símbolo, arquivo e sensor Inspector proposto. Preserve
explicitamente comportamento legado onde não houver `minimumSignatureLevel`.
