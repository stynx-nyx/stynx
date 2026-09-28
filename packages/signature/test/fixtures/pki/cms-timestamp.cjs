/* Test-only DER surgery: RFC 3161 token is an unsigned CMS signer attribute. */
const fs = require('node:fs');
const { createHash, sign } = require('node:crypto');
const { join } = require('node:path');
const asn1js = require('asn1js');

const decode = (path) => {
  const bytes = fs.readFileSync(path);
  const parsed = asn1js.fromBER(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  if (parsed.offset !== bytes.length) throw new Error(`Invalid DER: ${path}`);
  return parsed.result;
};
const children = (node) => node.valueBlock.value;
const signerInfo = (cms) => {
  const signedData = children(children(cms)[1])[0];
  const infos = children(signedData).at(-1);
  return children(infos)[0];
};
const signatureOctets = (info) => {
  const octet = children(info).find((node) => node instanceof asn1js.OctetString);
  if (!octet) throw new Error('CMS signature OCTET STRING absent');
  return Buffer.from(octet.valueBlock.valueHexView);
};
const [action, cmsPath, tokenPath, outputPath] = process.argv.slice(2);
const cms = decode(cmsPath);
const info = signerInfo(cms);
if (action === 'signature') {
  fs.writeFileSync(tokenPath, signatureOctets(info));
} else if (action === 'embed') {
  const response = decode(tokenPath);
  const token = children(response)[1];
  if (!token) throw new Error('TimeStampResp has no token');
  const attribute = new asn1js.Sequence({ value: [
    new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.9.16.2.14' }),
    new asn1js.Set({ value: [token] }),
  ] });
  children(info).push(new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 1 }, value: [attribute],
  }));
  fs.writeFileSync(outputPath, Buffer.from(cms.toBER(false)));
} else if (action === 'spoof') {
  const signedAttrs = children(info).find((node) => node.idBlock.tagClass === 3 && node.idBlock.tagNumber === 0);
  const ess = children(signedAttrs).find((node) => children(node)[0].valueBlock.toString() ===
    '1.2.840.113549.1.9.16.2.47');
  if (!ess) throw new Error('SigningCertificateV2 missing');
  const signingCertificate = children(children(ess)[1])[0];
  const certs = children(signingCertificate)[0];
  const bHash = createHash('sha256').update(fs.readFileSync(tokenPath)).digest();
  children(certs).push(new asn1js.Sequence({
    value: [new asn1js.OctetString({ valueHex: bHash })],
  }));
  const signedSet = new asn1js.Set({ value: children(signedAttrs) });
  const signature = sign('RSA-SHA256', Buffer.from(signedSet.toBER(false)),
    fs.readFileSync(join(__dirname, 'signer.key.pem')));
  const infoFields = children(info);
  const signatureIndex = infoFields.findIndex((node) => node instanceof asn1js.OctetString);
  infoFields[signatureIndex] = new asn1js.OctetString({ valueHex: signature });
  fs.writeFileSync(outputPath, Buffer.from(cms.toBER(false)));
} else {
  throw new Error('Use signature, embed, or spoof');
}
