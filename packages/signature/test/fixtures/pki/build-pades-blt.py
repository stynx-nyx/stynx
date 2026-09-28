"""Regenerate a real incremental PAdES B-LT test document (OpenSSL 3 + Node)."""
from pathlib import Path
import hashlib
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get('STYNX_OUTPUT_DIR', ROOT))
MANIFEST = os.environ.get('STYNX_MANIFEST_SHA256')
WITHDRAWAL = os.environ.get('STYNX_WITHDRAWAL_SHA256')
PREFIX = os.environ.get('STYNX_OUTPUT_PREFIX', 'pades')
B_B_ONLY = os.environ.get('STYNX_B_B_ONLY') == '1'
NO_DSS = os.environ.get('STYNX_NO_DSS') == '1'
if MANIFEST and (len(MANIFEST) != 64 or any(c not in '0123456789abcdef' for c in MANIFEST)):
    raise ValueError('STYNX_MANIFEST_SHA256 must be lowercase SHA-256 hex')
if WITHDRAWAL and (len(WITHDRAWAL) != 64 or any(c not in '0123456789abcdef' for c in WITHDRAWAL)):
    raise ValueError('STYNX_WITHDRAWAL_SHA256 must be lowercase SHA-256 hex')
OPENSSL = os.environ.get('OPENSSL_3', '/opt/homebrew/opt/openssl@3/bin/openssl')
if not Path(OPENSSL).exists():
    OPENSSL = 'openssl'


def add_objects(pdf, objects):
    offsets = {}
    for number, body in objects:
        offsets[number] = len(pdf)
        pdf += f'{number} 0 obj\n'.encode() + body + b'\nendobj\n'
    return pdf, offsets


def xref(pdf, offsets, previous=None):
    start = len(pdf)
    pdf += b'xref\n'
    for number in sorted(offsets):
        pdf += f'{number} 1\n{offsets[number]:010d} 00000 n \n'.encode()
    trailer = f'<< /Size {max(offsets) + 1} /Root 1 0 R'.encode()
    if previous is not None:
        trailer += f' /Prev {previous}'.encode()
    pdf += b'trailer\n' + trailer + b' >>\n'
    pdf += f'startxref\n{start}\n%%EOF\n'.encode()
    return pdf, start


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.DEVNULL)


source = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
source, initial = add_objects(source, [
    (1, b'<< /Type /Catalog /Pages 2 0 R'
     + (f' /STYNXWithdrawalSHA256 ({WITHDRAWAL})'.encode() if WITHDRAWAL else b'') + b' >>'),
    (2, b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    (3, b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>'),
    (4, b'<< /Length 0 >>\nstream\n\nendstream'),
])
source, first_xref = xref(source, initial)
(OUT / f'{PREFIX}-source.pdf').write_bytes(source)

placeholder = b'0' * 100000
old_range = b'/ByteRange [0000000000 0000000000 0000000000 0000000000]'
sig = (b'<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached '
       + (f'/STYNXManifestSHA256 ({MANIFEST}) '.encode() if MANIFEST else b'')
       + old_range + b' /Contents <' + placeholder + b'> >>')
revision = bytearray(source)
revision, offsets = add_objects(revision, [
    (1, b'<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>'),
    (3, b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Annots [6 0 R] >>'),
    (5, b'<< /Fields [6 0 R] /SigFlags 3 >>'),
    (6, b'<< /Type /Annot /Subtype /Widget /FT /Sig /T (Sig1) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R >>'),
    (7, sig),
])
revision, signed_xref = xref(revision, offsets, first_xref)
start = revision.index(b'/Contents <', len(source)) + len(b'/Contents <')
end = start + len(placeholder)
gap_start = start - 1  # ISO 32000: the '<' delimiter is outside ByteRange.
gap_end = end + 1     # The closing '>' delimiter is outside ByteRange too.
new_range = f'/ByteRange [{0:010d} {gap_start:010d} {gap_end:010d} {len(revision)-gap_end:010d}]'.encode()
assert len(old_range) == len(new_range)
revision = revision.replace(old_range, new_range)

with tempfile.TemporaryDirectory(prefix='stynx-pades-blt-') as temp:
    work = Path(temp)
    (work / 'content.bin').write_bytes(revision[:gap_start] + revision[gap_end:])
    run(OPENSSL, 'cms', '-sign', '-binary', '-cades', '-in', 'content.bin',
        '-signer', str(ROOT / 'signer.cert.pem'), '-inkey', str(ROOT / 'signer.key.pem'),
        '-certfile', str(ROOT / 'root.cert.pem'), '-outform', 'DER', '-out', 'base.cms.der', cwd=work)
    run('node', str(ROOT / 'cms-timestamp.cjs'), 'signature', 'base.cms.der', 'signature.bin', cwd=work)
    run(OPENSSL, 'ts', '-query', '-data', 'signature.bin', '-sha256', '-cert', '-out', 'request.tsq', cwd=work)
    (work / 'tsa.serial').write_text('01\n')
    (work / 'tsa.cnf').write_text('\n'.join([
        '[ tsa ]', 'default_tsa = tsa_config1', '[ tsa_config1 ]',
        f'dir = {work}', 'serial = tsa.serial',
        f'signer_cert = {ROOT / "tsa.cert.pem"}', f'signer_key = {ROOT / "tsa.key.pem"}',
        f'certs = {ROOT / "root.cert.pem"}', 'default_policy = 1.2.3.4.5.6.7',
        'crypto_device = builtin', 'signer_digest = sha256', 'digests = sha256',
        'accuracy = secs:1', 'ordering = yes', 'tsa_name = yes',
        'ess_cert_id_chain = no',
    ]) + '\n')
    run(OPENSSL, 'ts', '-reply', '-config', 'tsa.cnf', '-queryfile', 'request.tsq',
        '-out', 'timestamp.tsr', cwd=work)
    if not B_B_ONLY:
        run('node', str(ROOT / 'cms-timestamp.cjs'), 'embed', 'base.cms.der',
            'timestamp.tsr', 'final.cms.der', cwd=work)
    cms = (work / ('base.cms.der' if B_B_ONLY else 'final.cms.der')).read_bytes()
    assert len(cms) * 2 <= len(placeholder)
    revision[start:start + len(cms) * 2] = cms.hex().encode()
    (OUT / f'{PREFIX}-blt.cms.der').write_bytes(cms)
    (OUT / f'{PREFIX}-blt-timestamp.tsr').write_bytes((work / 'timestamp.tsr').read_bytes())
    (work / 'covered.bin').write_bytes(revision[:gap_start] + revision[gap_end:])
    run(OPENSSL, 'cms', '-verify', '-binary', '-cades', '-inform', 'DER', '-in',
        'base.cms.der' if B_B_ONLY else 'final.cms.der', '-content', 'covered.bin', '-CAfile', str(ROOT / 'root.cert.pem'),
        '-out', 'verified.bin', cwd=work)

if B_B_ONLY or NO_DSS:
    (OUT / f'{PREFIX}-blt.pdf').write_bytes(revision)
    print('PAdES base or B-T fixture:', len(source), 'source bytes,', len(cms), 'CMS bytes')
    raise SystemExit(0)

vri_key = hashlib.sha1(cms).hexdigest().upper()
certificate = (ROOT / 'signer.cert.der').read_bytes()
ocsp = (ROOT / 'ocsp-good.der').read_bytes()
crl = (ROOT / 'root.crl.der').read_bytes()
stream = lambda data: f'<< /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream'
final, offsets = add_objects(revision, [
    (1, b'<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R >>'),
    (8, f'<< /Type /DSS /Certs [10 0 R] /OCSPs [11 0 R] /CRLs [12 0 R] /VRI << /{vri_key} 9 0 R >> >>'.encode()),
    (9, b'<< /Cert [10 0 R] /OCSP [11 0 R] /CRL [12 0 R] >>'),
    (10, stream(certificate)),
    (11, stream(ocsp)),
    (12, stream(crl)),
])
final, _ = xref(final, offsets, signed_xref)
(OUT / f'{PREFIX}-blt.pdf').write_bytes(final)
print('PAdES B-LT fixture:', len(source), 'source bytes,', len(cms), 'CMS bytes,', vri_key)
