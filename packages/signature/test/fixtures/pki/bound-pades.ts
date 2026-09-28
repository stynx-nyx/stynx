import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A test-only PDF whose manifest hash is inside its signed ByteRange. */
export function buildManifestBoundPades(manifestSha256: string): {
  signedDocument: Uint8Array;
  cmsSignature: Uint8Array;
  timestampToken: Uint8Array;
} {
  if (!/^[a-f0-9]{64}$/u.test(manifestSha256)) throw new Error('manifest hash must be SHA-256');
  const temporary = mkdtempSync(join(tmpdir(), 'stynx-manifest-pades-'));
  const fixture = __dirname;
  const run = (args: string[]) => {
    const result = spawnSync('openssl', args, { cwd: temporary, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`OpenSSL fixture generation failed: ${result.stderr}`);
  };
  try {
    const placeholder = '0'.repeat(32768);
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Annots [5 0 R] >>',
      '<< /Fields [5 0 R] /SigFlags 3 >>',
      '<< /Type /Annot /Subtype /Widget /FT /Sig /T (Sig1) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream',
      `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ` +
        `/STYNXManifestSHA256 (${manifestSha256}) ` +
        `/ByteRange [0000000000 0000000000 0000000000 0000000000] ` +
        `/Contents <${placeholder}> >>`,
    ];
    let pdf = '%PDF-1.7\n%STYNX\n';
    const offsets = [0];
    for (const [i, body] of objects.entries()) {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    }
    const xrefAt = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
    const contentStart = pdf.indexOf('/Contents <') + '/Contents <'.length;
    const contentEnd = contentStart + placeholder.length;
    const oldRange = '/ByteRange [0000000000 0000000000 0000000000 0000000000]';
    const newRange =
      `/ByteRange [${'0'.repeat(10)} ${String(contentStart).padStart(10, '0')} ` +
      `${String(contentEnd).padStart(10, '0')} ${String(Buffer.byteLength(pdf) - contentEnd).padStart(10, '0')}]`;
    if (newRange.length !== oldRange.length) throw new Error('ByteRange width changed');
    pdf = pdf.replace(oldRange, newRange);
    const signedBytes = Buffer.from(pdf.slice(0, contentStart) + pdf.slice(contentEnd), 'binary');
    writeFileSync(join(temporary, 'content.bin'), signedBytes);
    run([
      'cms',
      '-sign',
      '-binary',
      '-in',
      'content.bin',
      '-signer',
      join(fixture, 'signer.cert.pem'),
      '-inkey',
      join(fixture, 'signer.key.pem'),
      '-certfile',
      join(fixture, 'root.cert.pem'),
      '-outform',
      'DER',
      '-out',
      'signature.der',
    ]);
    const cmsSignature = readFileSync(join(temporary, 'signature.der'));
    run([
      'cms',
      '-verify',
      '-binary',
      '-inform',
      'DER',
      '-in',
      'signature.der',
      '-content',
      'content.bin',
      '-CAfile',
      join(fixture, 'root.cert.pem'),
      '-out',
      'verified.bin',
    ]);
    if (cmsSignature.length * 2 > placeholder.length)
      throw new Error('CMS exceeds PDF placeholder');
    pdf =
      pdf.slice(0, contentStart) +
      cmsSignature.toString('hex') +
      placeholder.slice(cmsSignature.length * 2) +
      pdf.slice(contentEnd);
    writeFileSync(join(temporary, 'signed.pdf'), Buffer.from(pdf, 'binary'));
    run(['ts', '-query', '-data', 'signature.der', '-sha256', '-cert', '-out', 'timestamp.tsq']);
    writeFileSync(join(temporary, 'tsa.serial'), '01\n');
    const config = [
      '[ tsa ]',
      'default_tsa = tsa_config1',
      '[ tsa_config1 ]',
      `dir = ${temporary}`,
      'serial = tsa.serial',
      `signer_cert = ${join(fixture, 'tsa.cert.pem')}`,
      `signer_key = ${join(fixture, 'tsa.key.pem')}`,
      `certs = ${join(fixture, 'root.cert.pem')}`,
      'default_policy = 1.2.3.4.5.6.7',
      'digests = sha256',
      'accuracy = secs:1',
      'ordering = yes',
      'tsa_name = yes',
      'ess_cert_id_chain = no',
    ].join('\n');
    writeFileSync(join(temporary, 'tsa.cnf'), config);
    run([
      'ts',
      '-reply',
      '-config',
      'tsa.cnf',
      '-queryfile',
      'timestamp.tsq',
      '-out',
      'timestamp.tsr',
    ]);
    return {
      signedDocument: readFileSync(join(temporary, 'signed.pdf')),
      cmsSignature,
      timestampToken: readFileSync(join(temporary, 'timestamp.tsr')),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
