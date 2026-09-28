"""Regenerate a real incremental PAdES B-LT test document (OpenSSL 3 + Node)."""
from pathlib import Path
import base64
import hashlib
import os
import shutil
import subprocess
import tempfile
import time
import zlib

ROOT = Path(__file__).resolve().parent
OUT = Path(os.environ.get('STYNX_OUTPUT_DIR', ROOT))
MANIFEST = os.environ.get('STYNX_MANIFEST_SHA256')
WITHDRAWAL = os.environ.get('STYNX_WITHDRAWAL_SHA256')
PREFIX = os.environ.get('STYNX_OUTPUT_PREFIX', 'pades')
B_B_ONLY = os.environ.get('STYNX_B_B_ONLY') == '1'
NO_DSS = os.environ.get('STYNX_NO_DSS') == '1'
COMPACT_DSS = os.environ.get('STYNX_COMPACT_DSS') == '1'
COMPRESS_DSS = os.environ.get('STYNX_COMPRESS_DSS') == '1'
WRONG_SIGNER_OCSP = os.environ.get('STYNX_WRONG_SIGNER_OCSP') == '1'
OMIT_TSA_REVOCATION = os.environ.get('STYNX_OMIT_TSA_REVOCATION') == '1'
BYTE_RANGE_SPACES = os.environ.get('STYNX_BYTE_RANGE_SPACES') == '1'
REVOKE_SIGNER_OCSP = os.environ.get('STYNX_REVOKE_SIGNER_OCSP') == '1'
REVOKE_SIGNER_CRL = os.environ.get('STYNX_REVOKE_SIGNER_CRL') == '1'
ESS_SPOOF = os.environ.get('STYNX_ESS_SPOOF') == '1'
SIGNER_KIND = os.environ.get('STYNX_SIGNER_KIND', 'signer')
ATTACHED_CMS = os.environ.get('STYNX_ATTACHED_CMS') == '1'
PRE_TST_GOOD = os.environ.get('STYNX_PRE_TST_GOOD') == '1'
STALE_SIGNER_OCSP = os.environ.get('STYNX_STALE_SIGNER_OCSP') == '1'
INCLUDE_FRESH_SIGNER_OCSP = os.environ.get('STYNX_INCLUDE_FRESH_SIGNER_OCSP') == '1'
if SIGNER_KIND not in ('signer', 'spoof'):
    raise ValueError('STYNX_SIGNER_KIND must be signer or spoof')
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
if BYTE_RANGE_SPACES:
    new_range = f'/ByteRange [ {0:09d} {gap_start:010d} {gap_end:010d} {len(revision)-gap_end:09d} ]'.encode()
else:
    new_range = f'/ByteRange [{0:010d} {gap_start:010d} {gap_end:010d} {len(revision)-gap_end:010d}]'.encode()
assert len(old_range) == len(new_range)
revision = revision.replace(old_range, new_range)

with tempfile.TemporaryDirectory(prefix='stynx-pades-blt-') as temp:
    work = Path(temp)
    (work / 'content.bin').write_bytes(revision[:gap_start] + revision[gap_end:])
    if ATTACHED_CMS:
        (work / 'unrelated.bin').write_bytes(b'Unrelated CMS content, not the selected PDF ByteRange.\n')
    certfile = ROOT / 'root.cert.pem'
    if ESS_SPOOF:
        (work / 'cms-certs.pem').write_bytes((ROOT / 'root.cert.pem').read_bytes() +
                                              (ROOT / 'spoof.cert.pem').read_bytes())
        certfile = work / 'cms-certs.pem'
    signing = [OPENSSL, 'cms', '-sign', '-binary', '-cades']
    if ATTACHED_CMS:
        signing.append('-nodetach')
    run(*signing, '-in', 'unrelated.bin' if ATTACHED_CMS else 'content.bin',
        '-signer', str(ROOT / f'{SIGNER_KIND}.cert.pem'), '-inkey', str(ROOT / f'{SIGNER_KIND}.key.pem'),
        '-certfile', str(certfile), '-outform', 'DER', '-out', 'base.cms.der', cwd=work)
    if ESS_SPOOF:
        run('node', str(ROOT / 'cms-timestamp.cjs'), 'spoof', 'base.cms.der',
            str(ROOT / 'spoof.cert.der'), 'spoof.cms.der', cwd=work)
        shutil.move(work / 'spoof.cms.der', work / 'base.cms.der')
    def generate_revocation():
        serial = '03E9' if SIGNER_KIND == 'signer' else '03EB'
        subject = 'STYNX Test Signer' if SIGNER_KIND == 'signer' else 'STYNX Test Spoofed Party B'
        signer_index = (f'R\t270928000000Z\t260928000000Z\t{serial}\tunknown\t/CN={subject}\n'
                        if REVOKE_SIGNER_OCSP else
                        f'V\t270928000000Z\t\t{serial}\tunknown\t/CN={subject}\n')
        (work / 'ocsp-index.txt').write_text(signer_index +
            'V\t270928000000Z\t\t03EA\tunknown\t/CN=STYNX Test TSA\n')
        crl_signer_index = (f'R\t270928000000Z\t260928000000Z\t{serial}\tunknown\t/CN={subject}\n'
                            if REVOKE_SIGNER_CRL else
                            f'V\t270928000000Z\t\t{serial}\tunknown\t/CN={subject}\n')
        (work / 'crl-index.txt').write_text(crl_signer_index +
            'V\t270928000000Z\t\t03EA\tunknown\t/CN=STYNX Test TSA\n')
        for name in (SIGNER_KIND, 'tsa'):
            run(OPENSSL, 'ocsp', '-issuer', str(ROOT / 'root.cert.pem'),
                '-cert', str(ROOT / f'{name}.cert.pem'), '-reqout', f'{name}.ocsp.req.der', '-no_nonce', cwd=work)
            run(OPENSSL, 'ocsp', '-index', 'ocsp-index.txt', '-rsigner', str(ROOT / 'root.cert.pem'),
                '-rkey', str(ROOT / 'root.key.pem'), '-CA', str(ROOT / 'root.cert.pem'),
                '-reqin', f'{name}.ocsp.req.der', '-respout', f'{name}-ocsp.der', '-ndays', '7', '-noverify', cwd=work)
        (work / 'ca.serial').write_text('1004\n')
        (work / 'crl.serial').write_text('01\n')
        (work / 'ca.cnf').write_text('\n'.join([
            '[ ca ]', 'default_ca = ca_default', '[ ca_default ]', f'dir = {work}',
            'database = crl-index.txt', 'serial = ca.serial', 'crlnumber = crl.serial',
            f'certificate = {ROOT / "root.cert.pem"}', f'private_key = {ROOT / "root.key.pem"}',
            'default_md = sha256', 'default_crl_days = 7', 'policy = policy_any',
            '[ policy_any ]', 'commonName = supplied',
        ]) + '\n')
        run(OPENSSL, 'ca', '-config', 'ca.cnf', '-gencrl', '-out', 'fresh.crl.pem', '-batch', cwd=work)
        run(OPENSSL, 'crl', '-in', 'fresh.crl.pem', '-outform', 'DER', '-out', 'fresh.crl.der', cwd=work)
    if PRE_TST_GOOD or STALE_SIGNER_OCSP:
        generate_revocation()
        stale_signer_ocsp = (work / f'{SIGNER_KIND}-ocsp.der').read_bytes()
        time.sleep(1.1)
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
    if not PRE_TST_GOOD:
        generate_revocation()
    tsa_ocsp = (work / 'tsa-ocsp.der').read_bytes()
    fresh_signer_ocsp = (work / f'{SIGNER_KIND}-ocsp.der').read_bytes()
    signer_ocsp = stale_signer_ocsp if STALE_SIGNER_OCSP else (work / f'{SIGNER_KIND}-ocsp.der').read_bytes()
    fresh_crl = (work / 'fresh.crl.der').read_bytes()
    if not B_B_ONLY:
        run('node', str(ROOT / 'cms-timestamp.cjs'), 'embed', 'base.cms.der',
            'timestamp.tsr', 'final.cms.der', cwd=work)
    cms = (work / ('base.cms.der' if B_B_ONLY else 'final.cms.der')).read_bytes()
    assert len(cms) * 2 <= len(placeholder)
    revision[start:start + len(cms) * 2] = cms.hex().encode()
    (OUT / f'{PREFIX}-blt.cms.der').write_bytes(cms)
    (OUT / f'{PREFIX}-blt-timestamp.tsr').write_bytes((work / 'timestamp.tsr').read_bytes())
    (work / 'covered.bin').write_bytes(revision[:gap_start] + revision[gap_end:])
    verification = [OPENSSL, 'cms', '-verify', '-binary']
    if not ESS_SPOOF:
        verification.append('-cades')
    verify_content = [] if ATTACHED_CMS else ['-content', 'covered.bin']
    run(*verification, '-inform', 'DER', '-in',
        'base.cms.der' if B_B_ONLY else 'final.cms.der', *verify_content, '-CAfile', str(ROOT / 'root.cert.pem'),
        '-out', 'verified.bin', cwd=work)

if B_B_ONLY or NO_DSS:
    (OUT / f'{PREFIX}-blt.pdf').write_bytes(revision)
    print('PAdES base or B-T fixture:', len(source), 'source bytes,', len(cms), 'CMS bytes')
    raise SystemExit(0)

vri_key = hashlib.sha1(cms).hexdigest().upper()
certificate = (ROOT / f'{SIGNER_KIND}.cert.der').read_bytes()
tsa_certificate = base64.b64decode(''.join(
    line for line in (ROOT / 'tsa.cert.pem').read_text().splitlines() if not line.startswith('-----')))
ocsp = signer_ocsp
crl = fresh_crl
if WRONG_SIGNER_OCSP:
    ocsp = tsa_ocsp
def stream(data):
    payload = zlib.compress(data) if COMPRESS_DSS else data
    marker = ' /Filter /FlateDecode' if COMPRESS_DSS else ''
    return f'<< /Length {len(payload)}{marker} >>\nstream\n'.encode() + payload + b'\nendstream'
cert_refs = '10 0 R' if OMIT_TSA_REVOCATION else '10 0 R 14 0 R'
ocsp_refs = '11 0 R' + (' 15 0 R' if INCLUDE_FRESH_SIGNER_OCSP else '')
if not OMIT_TSA_REVOCATION:
    ocsp_refs += ' 13 0 R'
crl_refs = '' if OMIT_TSA_REVOCATION else '12 0 R'
if COMPACT_DSS:
    dss = f'<</Type/DSS/Certs[{cert_refs}]/OCSPs[{ocsp_refs}]/CRLs[{crl_refs}]/VRI<</{vri_key} 9 0 R>>>>'.encode()
    vri = f'<</Cert[{cert_refs}]/OCSP[{ocsp_refs}]/CRL[{crl_refs}]>>'.encode()
else:
    dss = f'<< /Type /DSS /Certs [{cert_refs}] /OCSPs [{ocsp_refs}] /CRLs [{crl_refs}] /VRI << /{vri_key} 9 0 R >> >>'.encode()
    vri = f'<< /Cert [{cert_refs}] /OCSP [{ocsp_refs}] /CRL [{crl_refs}] >>'.encode()
objects = [
    (1, b'<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R >>'),
    (8, dss),
    (9, vri),
    (10, stream(certificate)),
    (11, stream(ocsp)),
]
if not OMIT_TSA_REVOCATION:
    objects.extend([(12, stream(crl)), (13, stream(tsa_ocsp)), (14, stream(tsa_certificate))])
if INCLUDE_FRESH_SIGNER_OCSP:
    objects.append((15, stream(fresh_signer_ocsp)))
final, offsets = add_objects(revision, objects)
final, _ = xref(final, offsets, signed_xref)
(OUT / f'{PREFIX}-blt.pdf').write_bytes(final)
print('PAdES B-LT fixture:', len(source), 'source bytes,', len(cms), 'CMS bytes,', vri_key)
