"""Build a minimal PDF with detached CMS over its exact ByteRange."""
from pathlib import Path
import subprocess

root = Path(__file__).parent
placeholder = b'0' * 32768
objects = [
    b'<< /Type /Catalog /Pages 2 0 R /AcroForm 4 0 R >>',
    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Annots [5 0 R] >>',
    b'<< /Fields [5 0 R] /SigFlags 3 >>',
    b'<< /Type /Annot /Subtype /Widget /FT /Sig /T (Sig1) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R >>',
    b'<< /Length 0 >>\nstream\n\nendstream',
    b'<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached '
    b'/ByteRange [0000000000 0000000000 0000000000 0000000000] '
    b'/Contents <' + placeholder + b'> >>',
]
pdf = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
offsets = [0]
for number, body in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f'{number} 0 obj\n'.encode() + body + b'\nendobj\n')
xref_at = len(pdf)
pdf.extend(f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:
    pdf.extend(f'{offset:010d} 00000 n \n'.encode())
pdf.extend(f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n'.encode())
start = pdf.index(b'/Contents <') + len(b'/Contents <')
end = start + len(placeholder)
old = b'/ByteRange [0000000000 0000000000 0000000000 0000000000]'
replacement = f'/ByteRange [{0:010d} {start:010d} {end:010d} {len(pdf)-end:010d}]'.encode()
assert len(old) == len(replacement)
pdf = pdf.replace(old, replacement)
signed = bytes(pdf[:start] + pdf[end:])
(root / 'pades-content.bin').write_bytes(signed)
subprocess.run([
    'openssl', 'cms', '-sign', '-binary', '-in', 'pades-content.bin',
    '-signer', 'signer.cert.pem', '-inkey', 'signer.key.pem',
    '-certfile', 'root.cert.pem', '-outform', 'DER', '-out', 'pades.cms.der',
], cwd=root, check=True)
cms = (root / 'pades.cms.der').read_bytes()
assert len(cms) * 2 <= len(placeholder)
pdf[start:start + len(cms) * 2] = cms.hex().encode()
(root / 'pades-signed.pdf').write_bytes(pdf)
(root / 'pades-tampered.pdf').write_bytes(pdf.replace(b'/Catalog', b'/Catxlog'))
