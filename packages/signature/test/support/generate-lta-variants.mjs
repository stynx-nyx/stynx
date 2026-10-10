// Independent Inspector corpus: freshly signed TEST tokens; no private keys are copied to fixtures.
import { webcrypto, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';

pkijs.setEngine(
  'inspector-node',
  new pkijs.CryptoEngine({ name: 'inspector-node', crypto: webcrypto, subtle: webcrypto.subtle }),
);
const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg)
  throw new Error('Use <fresh scratch PKI directory> <public output directory>');
const source = resolve(sourceArg),
  output = resolve(outputArg);
mkdirSync(output, { recursive: true });
const read = (name) => readFileSync(join(source, name));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = (bytes) => {
  const parsed = asn1js.fromBER(bytes);
  if (parsed.offset !== bytes.byteLength)
    throw new Error('Independent DER parser did not consume whole input');
  return parsed.result;
};
const pem = (bytes) =>
  Buffer.from(bytes.toString('utf8').replace(/-----[^-]+-----|\s/gu, ''), 'base64');
const key = (name) =>
  webcrypto.subtle.importKey(
    'pkcs8',
    pem(read(name)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
const archiveKey = await key('archive-tsa.key.pem');
const archiveRootKey = await key('archive-tsa-root.key.pem');
const originalToken = read('minimal-lta.token.der');
const originalPdf = read('minimal-lta.pdf');
const ranges = [
  ...originalPdf.toString('latin1').matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
];
const range = ranges.at(-1).slice(1).map(Number);
const archiveAt = new pkijs.TSTInfo({
  schema: parse(
    new pkijs.SignedData({
      schema: new pkijs.ContentInfo({ schema: parse(originalToken) }).content,
    }).encapContentInfo.eContent.getValue(),
  ),
}).genTime;
const records = [];
const save = (name, bytes, extra = {}) => {
  if (bytes.includes(Buffer.from('PRIVATE KEY')))
    throw new Error('Private material forbidden in public fixture');
  writeFileSync(join(output, name), bytes);
  records.push({ path: name, bytes: bytes.length, sha256: sha(bytes), ...extra });
};
for (const name of [
  'source.pdf',
  'signature.cms.der',
  'signer.ocsp.der',
  'minimal-lta.pdf',
  'signer.cert.pem',
  'signer.cert.der',
  'signer-root.cert.pem',
  'signature-tsa-root.cert.pem',
  'archive-tsa-root.cert.pem',
])
  save(name, read(name));
const ct = '1.2.840.113549.1.9.3',
  md = '1.2.840.113549.1.9.4',
  ess = '1.2.840.113549.1.9.16.2.47';
const essV1 = (attrs, certificate, mode) => {
  const fields = [
    new asn1js.OctetString({
      valueHex:
        mode === 'wrong-hash'
          ? new Uint8Array(20).buffer
          : createHash('sha1')
              .update(Buffer.from(certificate.toSchema().toBER(false)))
              .digest(),
    }),
  ];
  if (mode !== 'hash-only')
    fields.push(
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [
              new asn1js.Constructed({
                idBlock: { tagClass: 3, tagNumber: 4 },
                value: [
                  mode === 'wrong-issuer'
                    ? new pkijs.RelativeDistinguishedNames({ typesAndValues: [] }).toSchema()
                    : certificate.issuer.toSchema(),
                ],
              }),
            ],
          }),
          mode === 'wrong-serial' ? new asn1js.Integer({ value: 9876 }) : certificate.serialNumber,
        ],
      }),
    );
  const binding = attrs.find((attr) => attr.type === ess);
  binding.type = '1.2.840.113549.1.9.16.2.12';
  binding.values = [
    new asn1js.Sequence({
      value: [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: fields })] })],
    }),
  ];
};
const variants = [
  [
    'token-container-content-type',
    ({ data }) => {
      data.encapContentInfo.eContentType = '1.2.840.113549.1.7.1';
    },
  ],
  [
    'token-multiple-signers',
    ({ data }) => {
      data.signerInfos.push(
        new pkijs.SignerInfo({
          schema: parse(Buffer.from(data.signerInfos[0].toSchema().toBER(false))),
        }),
      );
    },
  ],
  ['positive-ess-sha1', ({ attrs, certificate }) => essV1(attrs, certificate, 'hash-only')],
  ['positive-ess-sha1-issuer', ({ attrs, certificate }) => essV1(attrs, certificate, 'issuer')],
  [
    'token-ess-sha1-wrong-hash',
    ({ attrs, certificate }) => essV1(attrs, certificate, 'wrong-hash'),
  ],
  [
    'token-ess-sha1-wrong-issuer',
    ({ attrs, certificate }) => essV1(attrs, certificate, 'wrong-issuer'),
  ],
  [
    'token-ess-sha1-wrong-serial',
    ({ attrs, certificate }) => essV1(attrs, certificate, 'wrong-serial'),
  ],
  [
    'token-missing-digest',
    ({ attrs }) =>
      attrs.splice(
        attrs.findIndex((attr) => attr.type === md),
        1,
      ),
  ],
  [
    'token-multiple-digests',
    ({ attrs }) =>
      attrs
        .find((attr) => attr.type === md)
        .values.push(new asn1js.OctetString({ valueHex: new Uint8Array(32).buffer })),
  ],
  [
    'token-content-type-wrong-type',
    ({ attrs }) => {
      attrs.find((attr) => attr.type === ct).values = [
        new asn1js.Utf8String({ value: '1.2.840.113549.1.9.16.1.4' }),
      ];
    },
  ],
  [
    'positive-certificate-no-key-usage',
    ({ certificate }) => {
      certificate.extensions = certificate.extensions.filter(
        (extension) => extension.extnID !== '2.5.29.15',
      );
    },
  ],
  [
    'certificate-duplicate-key-usage',
    ({ certificate }) => {
      certificate.extensions.push(
        new pkijs.Extension({
          schema: parse(
            Buffer.from(
              certificate.extensions
                .find((extension) => extension.extnID === '2.5.29.15')
                .toSchema()
                .toBER(false),
            ),
          ),
        }),
      );
    },
  ],
  [
    'certificate-duplicate-eku',
    ({ certificate }) => {
      certificate.extensions.push(
        new pkijs.Extension({
          schema: parse(
            Buffer.from(
              certificate.extensions
                .find((extension) => extension.extnID === '2.5.29.37')
                .toSchema()
                .toBER(false),
            ),
          ),
        }),
      );
    },
  ],
  [
    'positive-max-clock-skew',
    ({ tst }) => {
      tst.genTime = new Date(archiveAt.getTime() + 300000);
    },
  ],
  [
    'token-content-type-data',
    ({ attrs }) => {
      attrs.find((a) => a.type === ct).values = [
        new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' }),
      ];
    },
  ],
  [
    'token-content-type-multiple',
    ({ attrs }) => {
      attrs
        .find((a) => a.type === ct)
        .values.push(new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.9.16.1.4' }));
    },
  ],
  [
    'token-duplicate-attribute',
    ({ attrs }) => {
      attrs.push(
        new pkijs.Attribute({
          schema: parse(
            Buffer.from(
              attrs
                .find((a) => a.type === ct)
                .toSchema()
                .toBER(false),
            ),
          ),
        }),
      );
    },
  ],
  [
    'token-missing-content-type',
    ({ attrs }) => {
      attrs.splice(
        attrs.findIndex((a) => a.type === ct),
        1,
      );
    },
  ],
  [
    'token-digest-wrong-type',
    ({ attrs }) => {
      attrs.find((a) => a.type === md).values = [new asn1js.Null()];
    },
  ],
  [
    'token-missing-ess',
    ({ attrs }) => {
      attrs.splice(
        attrs.findIndex((a) => a.type === ess),
        1,
      );
    },
  ],
  [
    'token-wrong-ess',
    ({ attrs }) => {
      const value = attrs.find((a) => a.type === ess).values[0];
      const sequence = value.valueBlock.value[0].valueBlock.value[0];
      const hash = sequence.valueBlock.value.find((v) => v instanceof asn1js.OctetString);
      hash.valueBlock.valueHex = new Uint8Array(32).buffer;
    },
  ],
  [
    'token-tst-version-two',
    ({ tst }) => {
      tst.version = 2;
    },
  ],
  [
    'token-future-time',
    ({ tst }) => {
      tst.genTime = new Date(archiveAt.getTime() + 300001);
    },
  ],
  [
    'token-before-signature-time',
    ({ tst }) => {
      tst.genTime = new Date(archiveAt.getTime() - 1000);
    },
  ],
  [
    'token-wrong-imprint',
    ({ tst }) => {
      tst.messageImprint.hashedMessage = new asn1js.OctetString({
        valueHex: new Uint8Array(32).buffer,
      });
    },
  ],
  [
    'certificate-noncritical-eku',
    ({ certificate }) => {
      certificate.extensions.find((e) => e.extnID === '2.5.29.37').critical = false;
    },
  ],
  [
    'certificate-multiple-eku',
    ({ certificate }) => {
      certificate.extensions.find((e) => e.extnID === '2.5.29.37').extnValue =
        new asn1js.OctetString({
          valueHex: new pkijs.ExtKeyUsage({
            keyPurposes: ['1.3.6.1.5.5.7.3.8', '1.3.6.1.5.5.7.3.9'],
          })
            .toSchema()
            .toBER(false),
        });
    },
  ],
  [
    'certificate-no-digital-signature',
    ({ certificate }) => {
      certificate.extensions.find((e) => e.extnID === '2.5.29.15').extnValue =
        new asn1js.OctetString({
          valueHex: new asn1js.BitString({
            unusedBits: 2,
            valueHex: Uint8Array.of(4).buffer,
          }).toBER(false),
        });
    },
  ],
  [
    'certificate-malformed-key-usage',
    ({ certificate }) => {
      certificate.extensions.find((e) => e.extnID === '2.5.29.15').extnValue =
        new asn1js.OctetString({ valueHex: new asn1js.Null().toBER(false) });
    },
  ],
  [
    'certificate-expired-at-verification',
    ({ certificate }) => {
      certificate.notAfter.value = new Date(archiveAt.getTime() - 1000);
    },
  ],
];
for (const [name, mutate] of variants) {
  const data = new pkijs.SignedData({
    schema: new pkijs.ContentInfo({ schema: parse(originalToken) }).content,
  });
  const tst = new pkijs.TSTInfo({ schema: parse(data.encapContentInfo.eContent.getValue()) });
  const attrs = data.signerInfos[0].signedAttrs.attributes;
  const certificate = data.certificates.find(
    (cert) =>
      cert instanceof pkijs.Certificate &&
      cert.subject.typesAndValues.some(
        (v) => v.value.valueBlock.value === 'DETRAN TEST ONLY archive-tsa',
      ),
  );
  if (!certificate) throw new Error('Missing independent archive certificate');
  mutate({ data, tst, attrs, certificate });
  if (name.includes('certificate-')) {
    await certificate.sign(archiveRootKey, 'SHA-256');
    const certHash = attrs
      .find((a) => a.type === ess)
      .values[0].valueBlock.value[0].valueBlock.value[0].valueBlock.value.find(
        (v) => v instanceof asn1js.OctetString,
      );
    certHash.valueBlock.valueHex = createHash('sha256')
      .update(Buffer.from(certificate.toSchema(true).toBER(false)))
      .digest().buffer;
  }
  const body = Buffer.from(tst.toSchema().toBER(false));
  data.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: body });
  if (!['token-digest-wrong-type', 'token-missing-digest', 'token-multiple-digests'].includes(name))
    attrs.find((a) => a.type === md).values = [
      new asn1js.OctetString({ valueHex: createHash('sha256').update(body).digest() }),
    ];
  data.signerInfos[0].signedAttrs.encodedValue = new ArrayBuffer(0);
  await data.sign(archiveKey, 0, 'SHA-256');
  const token = Buffer.from(
    new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: data.toSchema(true) })
      .toSchema()
      .toBER(false),
  );
  const rebound = new pkijs.SignedData({
    schema: new pkijs.ContentInfo({ schema: parse(token) }).content,
  });
  const info = rebound.signerInfos[0];
  const valid = await pkijs
    .getCrypto(true)
    .verifyWithPublicKey(
      info.signedAttrs.encodedValue,
      info.signature,
      certificate.subjectPublicKeyInfo,
      info.signatureAlgorithm,
    );
  if (!valid) throw new Error(`Independent signature verification failed for ${name}`);
  const encoded = token.toString('hex');
  const gapLength = range[2] - range[1] - 2;
  if (encoded.length > gapLength) throw new Error('Token exceeds fixed independent PDF gap');
  const pdf = Buffer.concat([
    originalPdf.subarray(0, range[1] + 1),
    Buffer.from(encoded.padEnd(gapLength, '0')),
    originalPdf.subarray(range[2] - 1),
  ]);
  save(`${name}.pdf`, pdf, {
    cryptographicTokenSignatureVerified: valid,
    ...(name.startsWith('positive-') ? { positive: name } : { negative: name }),
  });
}
// Generate DSS status witnesses with a new valid document timestamp over every changed byte.
const time = (date) => new pkijs.Time({ type: 1, value: date });
const signerRoot = new pkijs.Certificate({ schema: parse(pem(read('signer-root.cert.pem'))) });
const signerCertificate = new pkijs.Certificate({ schema: parse(read('signer.cert.der')) });
const signerRootKey = await key('signer-root.key.pem');
const signerKey = await key('signer.key.pem');
const signedRevision = read('signed-revision.pdf');
function appendRevision(prefix, objects) {
  const previous = [...prefix.toString('latin1').matchAll(/startxref\s+(\d+)\s+%%EOF/gu)].at(-1)[1];
  const chunks = [prefix],
    offsets = new Map();
  let length = prefix.length;
  for (const [number, body] of objects) {
    const chunk = Buffer.concat([
      Buffer.from(`${number} 0 obj\n`),
      body,
      Buffer.from('\nendobj\n'),
    ]);
    offsets.set(number, length);
    chunks.push(chunk);
    length += chunk.length;
  }
  let xref = 'xref\n';
  for (const number of [...offsets.keys()].sort((a, b) => a - b))
    xref += `${number} 1\n${String(offsets.get(number)).padStart(10, '0')} 00000 n \n`;
  chunks.push(
    Buffer.from(
      `${xref}trailer\n<< /Size 91 /Root 1 0 R /Prev ${previous} >>\nstartxref\n${length}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
const stream = (data) =>
  Buffer.concat([
    Buffer.from(`<< /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ]);
async function statusCrl(change) {
  const crl = new pkijs.CertificateRevocationList({ schema: parse(read('signer-root.crl.der')) });
  change(crl);
  await crl.sign(signerRootKey, 'SHA-256');
  if (!(await crl.verify({ issuerCertificate: signerRoot })))
    throw new Error('Independent CRL signature invalid');
  return Buffer.from(crl.toSchema(true).toBER(false));
}
async function statusOcsp(change, delegation) {
  const response = new pkijs.OCSPResponse({ schema: parse(read('signer.ocsp.der')) });
  const basic = new pkijs.BasicOCSPResponse({
    schema: parse(response.responseBytes.response.getValue()),
  });
  let signingKey = signerRootKey,
    signer = signerRoot;
  if (delegation) {
    signer = new pkijs.Certificate({ schema: parse(read('signer.cert.der')) });
    signer.serialNumber = new asn1js.Integer({ value: 4567 });
    signer.subject = new pkijs.RelativeDistinguishedNames({
      typesAndValues: [
        new pkijs.AttributeTypeAndValue({
          type: '2.5.4.3',
          value: new asn1js.Utf8String({ value: `Inspector OCSP ${delegation}` }),
        }),
      ],
    });
    signer.extensions.find((e) => e.extnID === '2.5.29.37').extnValue = new asn1js.OctetString({
      valueHex: new pkijs.ExtKeyUsage({ keyPurposes: ['1.3.6.1.5.5.7.3.9'] })
        .toSchema()
        .toBER(false),
    });
    if (delegation !== 'good')
      signer.extensions.find((e) => e.extnID === '2.5.29.15').extnValue = new asn1js.OctetString({
        valueHex:
          delegation === 'malformed'
            ? new asn1js.Null().toBER(false)
            : new asn1js.BitString({ unusedBits: 5, valueHex: Uint8Array.of(0x20).buffer }).toBER(
                false,
              ),
      });
    await signer.sign(signerRootKey, 'SHA-256');
    if (!(await signer.verify(signerRoot)))
      throw new Error('Independent delegated certificate signature invalid');
    basic.certs = [signer, signerRoot];
    basic.tbsResponseData.responderID = signer.subject;
    signingKey = signerKey;
  }
  await change(basic);
  await basic.sign(signingKey, 'SHA-256');
  if (
    !(await pkijs
      .getCrypto(true)
      .verifyWithPublicKey(
        basic.tbsResponseData.tbsView,
        basic.signature,
        signer.subjectPublicKeyInfo,
        basic.signatureAlgorithm,
      ))
  )
    throw new Error('Independent OCSP signature invalid');
  response.responseBytes.response = new asn1js.OctetString({
    valueHex: basic.toSchema(true).toBER(false),
  });
  return Buffer.from(response.toSchema().toBER(false));
}
async function statusPdf(
  name,
  {
    crls = [read('signer-root.crl.der')],
    ocsps = [read('signer.ocsp.der')],
    selectedCrls = crls,
    selectedOcsps = ocsps,
    expected = 'refuse',
    mode = 'crl',
    timestampMutation,
    prefix = signedRevision,
    cms = read('signature.cms.der'),
    leafCertificates = {},
    timestampAt = archiveAt,
  } = {},
) {
  const objects = [],
    certRefs = [],
    crlRefs = [],
    ocspRefs = [];
  for (const [i, leaf] of ['signer', 'signature-tsa', 'archive-tsa'].entries()) {
    objects.push([10 + i, stream(leafCertificates[leaf] ?? read(`${leaf}.cert.der`))]);
    certRefs.push(`${10 + i} 0 R`);
  }
  for (const [i, root] of ['signer-root', 'signature-tsa-root', 'archive-tsa-root'].entries()) {
    objects.push([13 + i, stream(pem(read(`${root}.cert.pem`)))]);
    certRefs.push(`${13 + i} 0 R`);
  }
  const allOcsp = [...ocsps, read('signature-tsa.ocsp.der'), read('archive-tsa.ocsp.der')];
  for (const [i, evidence] of allOcsp.entries()) {
    objects.push([20 + i, stream(evidence)]);
    ocspRefs.push(`${20 + i} 0 R`);
  }
  const allCrl = [...crls, read('signature-tsa-root.crl.der'), read('archive-tsa-root.crl.der')];
  for (const [i, evidence] of allCrl.entries()) {
    objects.push([30 + i, stream(evidence)]);
    crlRefs.push(`${30 + i} 0 R`);
  }
  const selectedOcspRefs = [
    ...selectedOcsps.map((value) => `${20 + ocsps.findIndex((item) => item.equals(value))} 0 R`),
    ...ocspRefs.slice(ocsps.length),
  ];
  const selectedCrlRefs = [
    ...selectedCrls.map((value) => `${30 + crls.findIndex((item) => item.equals(value))} 0 R`),
    ...crlRefs.slice(crls.length),
  ];
  const vri = createHash('sha1').update(cms).digest('hex').toUpperCase();
  objects.push([
    9,
    Buffer.from(
      `<< /Cert [${certRefs.join(' ')}] /OCSP [${selectedOcspRefs.join(' ')}] /CRL [${selectedCrlRefs.join(' ')}] >>`,
    ),
  ]);
  const dss = Buffer.from(
    `<< /Type /DSS /Certs [${certRefs.join(' ')}] /OCSPs [${ocspRefs.join(' ')}] /CRLs [${crlRefs.join(' ')}] /VRI << /${vri} 9 0 R >> >>`,
  );
  const blt = appendRevision(prefix, [
    [1, Buffer.from('<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R >>')],
    [8, dss],
    ...objects,
  ]);
  const marker = '/ByteRange [0000000000 0000000000 0000000000 0000000000]';
  const timestampObjects = [
    [5, Buffer.from('<< /Fields [6 0 R 41 0 R] /SigFlags 3 >>')],
    [
      41,
      Buffer.from(
        '<< /Type /Annot /Subtype /Widget /FT /Sig /T (IndependentArchive) /Rect [0 0 0 0] /P 3 0 R /V 40 0 R >>',
      ),
    ],
    [
      40,
      Buffer.from(
        `<< /Type /DocTimeStamp /Filter /Adobe.PPKLite /SubFilter /ETSI.RFC3161 ${marker} /Contents <${'0'.repeat(40000)}> >>`,
      ),
    ],
  ];
  const alterTimestamp = (number, before, after) => {
    const object = timestampObjects.find(([id]) => id === number);
    const text = object[1].toString('latin1');
    if (!text.includes(before)) throw new Error('Independent structural mutation did not match');
    object[1] = Buffer.from(text.replace(before, after), 'latin1');
  };
  if (timestampMutation === 'escaped-type')
    alterTimestamp(40, '/Type /DocTimeStamp', '/Type /DocTimeStamp /Ty#70e /DocTimeStamp');
  if (timestampMutation === 'escaped-subfilter')
    alterTimestamp(
      40,
      '/SubFilter /ETSI.RFC3161',
      '/SubFilter /ETSI.RFC3161 /Sub#46ilter /ETSI.RFC3161',
    );
  if (timestampMutation === 'visible-field')
    alterTimestamp(41, '/Rect [0 0 0 0]', '/Rect [0 0 10 10]');
  if (timestampMutation === 'field-parent')
    alterTimestamp(41, '/FT /Sig', '/FT /Sig /Parent 5 0 R');
  if (timestampMutation === 'field-appearance')
    alterTimestamp(41, '/FT /Sig', '/FT /Sig /AP << >>');
  if (timestampMutation === 'field-bad-page') alterTimestamp(41, '/P 3 0 R', '/P 2 0 R');
  if (timestampMutation === 'field-direct-value') alterTimestamp(41, '/V 40 0 R', '/V << >>');
  if (timestampMutation === 'form-extra-key')
    alterTimestamp(5, '/SigFlags 3', '/SigFlags 3 /NeedAppearances true');
  if (timestampMutation === 'reordered-fields')
    alterTimestamp(5, '/Fields [6 0 R 41 0 R]', '/Fields [41 0 R 6 0 R]');
  if (timestampMutation === 'direct-field')
    alterTimestamp(5, '/Fields [6 0 R 41 0 R]', '/Fields [6 0 R << /FT /Sig >>]');
  if (timestampMutation === 'wrong-filter')
    alterTimestamp(40, '/Filter /Adobe.PPKLite', '/Filter /Unreviewed');
  if (timestampMutation === 'positive-field-string')
    alterTimestamp(41, '(IndependentArchive)', '(Independent(Archive\\)Nested))');
  if (timestampMutation === 'positive-comment')
    alterTimestamp(41, '/FT /Sig', '/FT % dictionary comment with /FT /Type\n /Sig');
  if (timestampMutation === 'removed-field')
    alterTimestamp(5, '/Fields [6 0 R 41 0 R]', '/Fields [41 0 R]');
  if (timestampMutation === 'changed-sigflags') alterTimestamp(5, '/SigFlags 3', '/SigFlags 1');
  if (timestampMutation === 'unknown-timestamp-entry')
    alterTimestamp(40, '/Filter /Adobe.PPKLite', '/Filter /Adobe.PPKLite /Unreviewed true');
  if (timestampMutation === 'changed-old-field')
    timestampObjects.push([6, Buffer.from('<< /FT /Sig /T (ChangedOldField) /V 7 0 R >>')]);
  if (timestampMutation === 'unreferenced-object')
    timestampObjects.push([89, Buffer.from('<< /Title (Unreferenced hidden object) >>')]);
  if (timestampMutation === 'catalog-metadata')
    timestampObjects.push([
      1,
      Buffer.from('<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R /Lang (en) >>'),
    ]);
  let pdf = appendRevision(blt, timestampObjects);
  if (timestampMutation === 'duplicate-xref') {
    const tail = pdf.subarray(blt.length).toString('latin1');
    const row = /40 1\n(\d{10} 00000 n \n)/u.exec(tail);
    if (!row) throw new Error('Independent xref mutation did not match');
    pdf = Buffer.concat([
      pdf.subarray(0, blt.length),
      Buffer.from(tail.replace(row[0], row[0] + row[0]), 'latin1'),
    ]);
  }
  if (timestampMutation === 'changed-trailer') {
    const tail = pdf.subarray(blt.length).toString('latin1');
    pdf = Buffer.concat([
      pdf.subarray(0, blt.length),
      Buffer.from(tail.replace('/Prev ', '/ID [<0102> <0304>] /Prev '), 'latin1'),
    ]);
  }
  if (timestampMutation === 'unindexed-bytes') {
    const offset = Number(
      [...pdf.toString('latin1').matchAll(/startxref\s+(\d+)\s+%%EOF/gu)].at(-1)[1],
    );
    const hidden = Buffer.from('88 0 obj\n<< /Hidden true >>\nendobj\n');
    pdf = Buffer.concat([
      pdf.subarray(0, offset),
      hidden,
      Buffer.from(
        pdf
          .subarray(offset)
          .toString('latin1')
          .replace(`startxref\n${offset}`, `startxref\n${offset + hidden.length}`),
        'latin1',
      ),
    ]);
  }
  const begin = pdf.indexOf(Buffer.from('/Contents <'), blt.length) + 10,
    end = begin + 40002;
  const text = `/ByteRange [${String(0).padStart(10, '0')} ${String(begin).padStart(10, '0')} ${String(end).padStart(10, '0')} ${String(pdf.length - end).padStart(10, '0')}]`;
  pdf = Buffer.concat([
    pdf.subarray(0, blt.length),
    Buffer.from(pdf.subarray(blt.length).toString('latin1').replace(marker, text), 'latin1'),
  ]);
  const covered = Buffer.concat([pdf.subarray(0, begin), pdf.subarray(end)]);
  const token = new pkijs.SignedData({
    schema: new pkijs.ContentInfo({ schema: parse(originalToken) }).content,
  });
  const tst = new pkijs.TSTInfo({ schema: parse(token.encapContentInfo.eContent.getValue()) });
  tst.genTime = timestampAt;
  tst.messageImprint.hashedMessage = new asn1js.OctetString({
    valueHex: createHash('sha256').update(covered).digest(),
  });
  const body = Buffer.from(tst.toSchema().toBER(false));
  token.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: body });
  token.signerInfos[0].signedAttrs.attributes.find((a) => a.type === md).values = [
    new asn1js.OctetString({ valueHex: createHash('sha256').update(body).digest() }),
  ];
  token.signerInfos[0].signedAttrs.encodedValue = new ArrayBuffer(0);
  await token.sign(archiveKey, 0, 'SHA-256');
  const encoded = Buffer.from(
    new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: token.toSchema(true) })
      .toSchema()
      .toBER(false),
  ).toString('hex');
  const result = Buffer.concat([
    pdf.subarray(0, begin + 1),
    Buffer.from(encoded.padEnd(40000, '0')),
    pdf.subarray(end - 1),
  ]);
  if (timestampMutation === 'nonzero-token-padding') result[begin + 1 + encoded.length] = 0x31;
  save(`${name}.pdf`, result, {
    statusScenario: name,
    expected,
    mode,
    authenticatedArchiveSignature: true,
    archiveAt: timestampAt.toISOString(),
  });
}
const goodCrl = read('signer-root.crl.der'),
  goodOcsp = read('signer.ocsp.der');
const lateCrl = await statusCrl((crl) => {
  crl.thisUpdate = time(new Date(archiveAt.getTime() + 1000));
});
const revokedCrl = await statusCrl((crl) => {
  crl.revokedCertificates = [
    new pkijs.RevokedCertificate({
      userCertificate: signerCertificate.serialNumber,
      revocationDate: time(new Date(archiveAt.getTime() - 1000)),
    }),
  ];
});
await statusPdf('historical-crl-equality', {
  crls: [
    await statusCrl((crl) => {
      crl.thisUpdate = time(archiveAt);
      crl.nextUpdate = time(archiveAt);
    }),
  ],
  expected: 'pass',
});
await statusPdf('historical-crl-expired', {
  crls: [
    await statusCrl((crl) => {
      crl.nextUpdate = time(new Date(archiveAt.getTime() - 1000));
    }),
  ],
});
await statusPdf('historical-crl-late', { crls: [lateCrl] });
await statusPdf('historical-crl-good-then-late', { crls: [goodCrl, lateCrl] });
await statusPdf('historical-crl-late-then-good', { crls: [lateCrl, goodCrl] });
await statusPdf('historical-global-only-late-crl', {
  crls: [goodCrl, lateCrl],
  selectedCrls: [goodCrl],
});
await statusPdf('historical-global-only-revoked-crl', {
  crls: [goodCrl, revokedCrl],
  selectedCrls: [goodCrl],
});
for (const kind of ['same-hash', 'different-hash', 'contradictory']) {
  const evidence = await statusOcsp(async (basic) => {
    const entry = new pkijs.SingleResponse({
      schema: parse(Buffer.from(basic.tbsResponseData.responses[0].toSchema().toBER(false))),
    });
    if (kind === 'different-hash')
      entry.certID = await pkijs.CertID.create(signerCertificate, {
        issuerCertificate: signerRoot,
        hashAlgorithm: 'SHA-256',
      });
    if (kind === 'contradictory')
      entry.certStatus = new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 1 },
        value: [new asn1js.GeneralizedTime({ valueDate: new Date(archiveAt.getTime() - 1000) })],
      });
    basic.tbsResponseData.responses.push(entry);
  });
  await statusPdf(`historical-ocsp-duplicate-${kind}`, { ocsps: [evidence], mode: 'ocsp' });
}
for (const delegation of ['good', 'no-digital-signature', 'malformed'])
  await statusPdf(`historical-ocsp-delegated-${delegation}`, {
    ocsps: [await statusOcsp(async () => {}, delegation)],
    mode: 'ocsp',
    expected: delegation === 'good' ? 'pass' : 'refuse',
  });
const lateOcsp = await statusOcsp(async (basic) => {
  basic.tbsResponseData.producedAt = new Date(archiveAt.getTime() + 1000);
});
await statusPdf('historical-global-only-late-ocsp', {
  ocsps: [goodOcsp, lateOcsp],
  selectedOcsps: [goodOcsp],
  mode: 'ocsp',
});
await statusPdf('historical-ocsp-good-then-late', { ocsps: [goodOcsp, lateOcsp], mode: 'ocsp' });
await statusPdf('historical-ocsp-late-then-good', { ocsps: [lateOcsp, goodOcsp], mode: 'ocsp' });
await statusPdf('historical-ocsp-equality', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.tbsResponseData.producedAt = archiveAt;
      basic.tbsResponseData.responses[0].thisUpdate = archiveAt;
      basic.tbsResponseData.responses[0].nextUpdate = archiveAt;
    }),
  ],
  mode: 'ocsp',
  expected: 'pass',
});
await statusPdf('historical-ocsp-responder-by-key', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.tbsResponseData.responderID = new asn1js.OctetString({
        valueHex: createHash('sha1')
          .update(signerRoot.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView)
          .digest(),
      });
    }),
  ],
  mode: 'ocsp',
  expected: 'pass',
});
await statusPdf('historical-ocsp-responder-certificate-missing', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.certs = [];
    }),
  ],
  mode: 'ocsp',
});
await statusPdf('historical-ocsp-responder-certificate-ambiguous', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.certs.push(signerRoot);
    }),
  ],
  mode: 'ocsp',
});
await statusPdf('historical-ocsp-late-update', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.tbsResponseData.responses[0].thisUpdate = new Date(archiveAt.getTime() + 1000);
    }),
  ],
  mode: 'ocsp',
});
await statusPdf('historical-ocsp-expired', {
  ocsps: [
    await statusOcsp(async (basic) => {
      basic.tbsResponseData.responses[0].nextUpdate = new Date(archiveAt.getTime() - 1000);
    }),
  ],
  mode: 'ocsp',
});
await statusPdf('historical-ocsp-no-next-update', {
  ocsps: [
    await statusOcsp(async (basic) => {
      delete basic.tbsResponseData.responses[0].nextUpdate;
    }),
  ],
  mode: 'ocsp',
});
await statusPdf('historical-crl-no-next-update', {
  crls: [
    await statusCrl((crl) => {
      delete crl.nextUpdate;
    }),
  ],
});
const failedResponse = new pkijs.OCSPResponse({
  responseStatus: new asn1js.Enumerated({ value: 3 }),
});
await statusPdf('historical-ocsp-failed-response-with-good', {
  ocsps: [Buffer.from(failedResponse.toSchema().toBER(false)), goodOcsp],
  mode: 'ocsp',
  expected: 'pass',
});

const currentArchiveCrl = new pkijs.CertificateRevocationList({
  schema: parse(read('archive-tsa-root.crl.der')),
});
currentArchiveCrl.thisUpdate = time(new Date(archiveAt.getTime() + 86400000));
currentArchiveCrl.nextUpdate = time(new Date(archiveAt.getTime() + 8 * 86400000));
await currentArchiveCrl.sign(archiveRootKey, 'SHA-256');
const archiveRoot = new pkijs.Certificate({
  schema: parse(pem(read('archive-tsa-root.cert.pem'))),
});
if (!(await currentArchiveCrl.verify({ issuerCertificate: archiveRoot })))
  throw new Error('Independent current CRL signature invalid');
save(
  'current-archive-plus-day.crl.der',
  Buffer.from(currentArchiveCrl.toSchema(true).toBER(false)),
);
currentArchiveCrl.revokedCertificates = [
  new pkijs.RevokedCertificate({
    userCertificate: new asn1js.Integer({ value: 1003 }),
    revocationDate: time(new Date(archiveAt.getTime() + 1000)),
  }),
];
await currentArchiveCrl.sign(archiveRootKey, 'SHA-256');
save('current-archive-revoked.crl.der', Buffer.from(currentArchiveCrl.toSchema(true).toBER(false)));
await statusPdf('historical-missing-signer-status', { crls: [], ocsps: [] });

for (const timestampMutation of [
  'escaped-type',
  'escaped-subfilter',
  'visible-field',
  'removed-field',
  'changed-sigflags',
  'unknown-timestamp-entry',
  'changed-old-field',
  'unreferenced-object',
  'catalog-metadata',
  'duplicate-xref',
  'field-parent',
  'field-appearance',
  'field-bad-page',
  'field-direct-value',
  'form-extra-key',
  'reordered-fields',
  'direct-field',
  'wrong-filter',
  'changed-trailer',
  'unindexed-bytes',
  'positive-field-string',
  'positive-comment',
  'nonzero-token-padding',
])
  await statusPdf(`structural-${timestampMutation}`, {
    timestampMutation,
    expected: timestampMutation.startsWith('positive-') ? 'pass' : 'refuse',
  });

// Reissue our own TEST leaf, preserve the approval's covered bytes, and sign a new CMS.
// The document timestamp is two days later: each shortened leaf is valid at signing
// but expired at the required archive-time certificate validation boundary.
for (const target of [
  'signer',
  'signature-tsa',
  'control',
  'ambiguous-signature-tsa',
  'invalid-signature-tsa-version',
]) {
  const later = new Date(archiveAt.getTime() + 2 * 86400000);
  const cms = new pkijs.SignedData({
    schema: new pkijs.ContentInfo({ schema: parse(read('signature.cms.der')) }).content,
  });
  const leaves = {};
  if (target === 'signer' || target === 'signature-tsa') {
    const certificate = new pkijs.Certificate({ schema: parse(read(`${target}.cert.der`)) });
    certificate.notAfter.value = new Date(archiveAt.getTime() + 86400000);
    await certificate.sign(await key(`${target}-root.key.pem`), 'SHA-256');
    leaves[target] = Buffer.from(certificate.toSchema(true).toBER(false));
    if (target === 'signer') {
      cms.certificates = cms.certificates.map((value) =>
        value instanceof pkijs.Certificate && value.serialNumber.isEqual(certificate.serialNumber)
          ? certificate
          : value,
      );
      const binding = cms.signerInfos[0].signedAttrs.attributes.find((a) => a.type === ess);
      const hash = binding.values[0].valueBlock.value[0].valueBlock.value[0].valueBlock.value.find(
        (value) => value instanceof asn1js.OctetString,
      );
      hash.valueBlock.valueHex = createHash('sha256').update(leaves.signer).digest().buffer;
      cms.signerInfos[0].signedAttrs.encodedValue = new ArrayBuffer(0);
      const approvalRange = [
        ...signedRevision
          .toString('latin1')
          .matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
      ]
        .at(-1)
        .slice(1)
        .map(Number);
      const detached = Buffer.concat([
        signedRevision.subarray(0, approvalRange[1]),
        signedRevision.subarray(approvalRange[2]),
      ]);
      await cms.sign(signerKey, 0, 'SHA-256', detached);
      save(
        `path-${target}-leaf.cert.pem`,
        Buffer.from(
          `-----BEGIN CERTIFICATE-----\n${leaves.signer
            .toString('base64')
            .match(/.{1,64}/gu)
            .join('\n')}\n-----END CERTIFICATE-----\n`,
        ),
      );
    }
  }
  const unsigned = cms.signerInfos[0].unsignedAttrs.attributes.find(
    (attribute) => attribute.type === '1.2.840.113549.1.9.16.2.14',
  );
  const stamp = new pkijs.SignedData({
    schema: new pkijs.ContentInfo({ schema: unsigned.values[0] }).content,
  });
  if (target === 'signature-tsa') {
    const certificate = new pkijs.Certificate({ schema: parse(leaves[target]) });
    stamp.certificates = stamp.certificates.map((value) =>
      value instanceof pkijs.Certificate && value.serialNumber.isEqual(certificate.serialNumber)
        ? certificate
        : value,
    );
    const binding = stamp.signerInfos[0].signedAttrs.attributes.find((a) => a.type === ess);
    const hash = binding.values[0].valueBlock.value[0].valueBlock.value[0].valueBlock.value.find(
      (value) => value instanceof asn1js.OctetString,
    );
    hash.valueBlock.valueHex = createHash('sha256').update(leaves[target]).digest().buffer;
  }
  if (target === 'ambiguous-signature-tsa')
    stamp.signerInfos.push(
      new pkijs.SignerInfo({
        schema: parse(Buffer.from(stamp.signerInfos[0].toSchema().toBER(false))),
      }),
    );
  const tst = new pkijs.TSTInfo({ schema: parse(stamp.encapContentInfo.eContent.getValue()) });
  if (target === 'invalid-signature-tsa-version') tst.version = 2;
  tst.messageImprint.hashedMessage = new asn1js.OctetString({
    valueHex: createHash('sha256')
      .update(Buffer.from(cms.signerInfos[0].signature.getValue()))
      .digest(),
  });
  const body = Buffer.from(tst.toSchema().toBER(false));
  stamp.encapContentInfo.eContent = new asn1js.OctetString({ valueHex: body });
  stamp.signerInfos[0].signedAttrs.attributes.find((a) => a.type === md).values = [
    new asn1js.OctetString({ valueHex: createHash('sha256').update(body).digest() }),
  ];
  stamp.signerInfos[0].signedAttrs.encodedValue = new ArrayBuffer(0);
  await stamp.sign(await key('signature-tsa.key.pem'), 0, 'SHA-256');
  unsigned.values = [
    new pkijs.ContentInfo({
      contentType: '1.2.840.113549.1.7.2',
      content: stamp.toSchema(true),
    }).toSchema(),
  ];
  const encoded = Buffer.from(
    new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: cms.toSchema(true) })
      .toSchema()
      .toBER(false),
  );
  const match = [
    ...signedRevision
      .toString('latin1')
      .matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
  ]
    .at(-1)
    .slice(1)
    .map(Number);
  const prefix = Buffer.concat([
    signedRevision.subarray(0, match[1] + 1),
    Buffer.from(encoded.toString('hex').padEnd(match[2] - match[1] - 2, '0')),
    signedRevision.subarray(match[2] - 1),
  ]);
  save(`path-${target}.cms.der`, encoded);
  await statusPdf(`path-${target}-expired-at-archive`, {
    prefix,
    cms: encoded,
    leafCertificates: leaves,
    timestampAt: later,
    expected: target === 'control' ? 'pass' : 'refuse',
  });
  const record = records.at(-1);
  record.cmsPath = `path-${target}.cms.der`;
  record.certPath = target === 'signer' ? `path-${target}-leaf.cert.pem` : 'signer.cert.pem';
  if (target === 'ambiguous-signature-tsa') record.errorMessage = 'Timestamp signer is ambiguous';
  else if (target === 'invalid-signature-tsa-version')
    record.errorMessage = 'Signature timestamp exceeds archive time';
  else if (target !== 'control')
    record.errorMessage =
      target === 'signer'
        ? 'Cryptographic trust evidence is invalid'
        : 'Certificate path invalid at required time';
}
const laterStatus = new pkijs.CertificateRevocationList({
  schema: parse(read('archive-tsa-root.crl.der')),
});
laterStatus.thisUpdate = time(new Date(archiveAt.getTime() + 2 * 86400000));
laterStatus.nextUpdate = time(new Date(archiveAt.getTime() + 8 * 86400000));
await laterStatus.sign(archiveRootKey, 'SHA-256');
save('current-archive-plus-two-days.crl.der', Buffer.from(laterStatus.toSchema(true).toBER(false)));

writeFileSync(
  join(output, 'provenance.json'),
  JSON.stringify(
    {
      classification: 'FRESH INSPECTOR SYNTHETIC TEST ONLY; no provider or production policy claim',
      archiveAt: archiveAt.toISOString(),
      generatorSha256: sha(readFileSync(new URL(import.meta.url))),
      seedBuilderSha256: sha(readFileSync(new URL('./generate-lta-pki.py', import.meta.url))),
      files: records,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    files: records.length,
    signedNegativeTokens: variants.length,
    archiveAt: archiveAt.toISOString(),
  }),
);
