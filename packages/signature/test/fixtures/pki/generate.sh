#!/bin/sh
set -eu
cd "$(dirname "$0")"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out root.key.pem 2>/dev/null
openssl req -x509 -new -key root.key.pem -days 3650 -sha256 -config root.cnf -out root.cert.pem
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signer.key.pem 2>/dev/null
openssl req -new -key signer.key.pem -subj '/CN=STYNX Test Signer' -out signer.csr.pem
cat > signer.ext <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=emailProtection
certificatePolicies=1.2.3.4.5.6.7
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EXT
openssl x509 -req -in signer.csr.pem -CA root.cert.pem -CAkey root.key.pem -set_serial 1001 -days 365 -sha256 -extfile signer.ext -out signer.cert.pem 2>/dev/null
openssl x509 -in signer.cert.pem -outform DER -out signer.cert.der
printf 'STYNX signed PDF ByteRange fixture\n' > document.bin
openssl cms -sign -binary -in document.bin -signer signer.cert.pem -inkey signer.key.pem -certfile root.cert.pem -outform DER -out document.cms.der
openssl cms -verify -binary -inform DER -in document.cms.der -content document.bin -CAfile root.cert.pem -out /dev/null >/dev/null 2>&1
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out tsa.key.pem 2>/dev/null
openssl req -new -key tsa.key.pem -subj '/CN=STYNX Test TSA' -out tsa.csr.pem
cat > tsa.ext <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,timeStamping
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EXT
openssl x509 -req -in tsa.csr.pem -CA root.cert.pem -CAkey root.key.pem -set_serial 1002 -days 365 -sha256 -extfile tsa.ext -out tsa.cert.pem 2>/dev/null
python3 build-pades.py
openssl ts -query -data pades.cms.der -sha256 -cert -out timestamp.tsq 2>/dev/null
printf '01\n' > tsa.serial
openssl ts -reply -config tsa.cnf -queryfile timestamp.tsq -out timestamp.tsr 2>/dev/null
openssl ocsp -issuer root.cert.pem -cert signer.cert.pem -reqout signer.ocsp.req.der -no_nonce >/dev/null 2>&1
printf 'V\t270928000000Z\t\t03E9\tunknown\t/CN=STYNX Test Signer\n' > index.txt
openssl ocsp -index index.txt -rsigner root.cert.pem -rkey root.key.pem -CA root.cert.pem -reqin signer.ocsp.req.der -respout ocsp-good.der -ndays 7 -noverify >/dev/null 2>&1
printf '1003\n' > ca.serial
printf '01\n' > crl.serial
openssl ca -config ca.cnf -gencrl -out root.crl.pem -batch >/dev/null 2>&1
openssl crl -in root.crl.pem -outform DER -out root.crl.der
printf 'R\t270928000000Z\t260928153500Z\t03E9\tunknown\t/CN=STYNX Test Signer\n' > index-revoked.txt
openssl ocsp -index index-revoked.txt -rsigner root.cert.pem -rkey root.key.pem -CA root.cert.pem -reqin signer.ocsp.req.der -respout ocsp-revoked.der -ndays 7 -noverify >/dev/null 2>&1
openssl ocsp -issuer root.cert.pem -serial 0x2222 -reqout unknown.ocsp.req.der -no_nonce >/dev/null 2>&1
openssl ocsp -index index.txt -rsigner root.cert.pem -rkey root.key.pem -CA root.cert.pem -reqin unknown.ocsp.req.der -respout ocsp-unknown.der -ndays 7 -noverify >/dev/null 2>&1
cp index.txt index-good.txt
cp index-revoked.txt index.txt
openssl ca -config ca.cnf -gencrl -out revoked.crl.pem -batch >/dev/null 2>&1
openssl crl -in revoked.crl.pem -outform DER -out revoked.crl.der
cp index-good.txt index.txt
python3 - <<'PYATTEST'
import hashlib, json
from pathlib import Path
content_hash = hashlib.sha256(Path('document.bin').read_bytes()).hexdigest()
record = {'tenantId':'tenant-a','caseId':'case-a','documentId':'document-a','contentHash':content_hash,'signerPartyId':'party-a','verificationMethod':'physical_verified','evidenceRef':'attestation-a','verifiedAt':'2026-09-29T12:00:00.000Z'}
Path('attestation.json').write_text(json.dumps(record, separators=(',', ':'))+'\n')
PYATTEST
openssl cms -sign -binary -in attestation.json -signer signer.cert.pem -inkey signer.key.pem -certfile root.cert.pem -outform DER -out attestation.cms.der
python3 - <<'PYCLEAN'
from pathlib import Path
for name in ('crl.serial.old','signer.csr.pem','tsa.csr.pem','signer.ocsp.req.der',
             'unknown.ocsp.req.der','document.cms.der','pades-content.bin',
             'timestamp.tsq','root.crl.pem','revoked.crl.pem','index-good.txt'):
    Path(name).unlink(missing_ok=True)
PYCLEAN
openssl cms -verify -binary -inform DER -in attestation.cms.der -content attestation.json -CAfile root.cert.pem -out /dev/null >/dev/null 2>&1
python3 - <<'PYPDF'
from pathlib import Path
pdf = Path('pades-signed.pdf').read_bytes()
a = pdf.index(b'/Contents <') + len(b'/Contents <')
b = pdf.index(b'>', a)
Path('pades-covered.bin').write_bytes(pdf[:a] + pdf[b:])
PYPDF
openssl cms -verify -binary -inform DER -in pades.cms.der -content pades-covered.bin -CAfile root.cert.pem -out /dev/null >/dev/null 2>&1
python3 - <<'PYCOVER'
from pathlib import Path
Path('pades-covered.bin').unlink()
PYCOVER
