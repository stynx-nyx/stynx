/* Test-only DER surgery: RFC 3161 token is an unsigned CMS signer attribute. */
const fs = require('node:fs');
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
} else {
  throw new Error('Use signature or embed');
}
