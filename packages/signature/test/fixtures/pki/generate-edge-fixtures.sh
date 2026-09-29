#!/bin/sh
# Regenerate PKI edge cases using the existing test trust root (OpenSSL 3).
set -eu
cd "$(dirname "$0")"
OPENSSL_3=${OPENSSL_3:-/opt/homebrew/opt/openssl@3/bin/openssl}
if [ ! -x "$OPENSSL_3" ]; then OPENSSL_3=openssl; fi

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out intermediate.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key intermediate.key.pem -subj '/CN=STYNX Test Intermediate' -out intermediate.csr.pem
cat > intermediate.ext <<'EXT'
basicConstraints=critical,CA:TRUE,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EXT
"$OPENSSL_3" x509 -req -in intermediate.csr.pem -CA root.cert.pem -CAkey root.key.pem \
  -set_serial 1006 -days 365 -sha256 -extfile intermediate.ext -out intermediate.cert.pem 2>/dev/null
"$OPENSSL_3" x509 -in intermediate.cert.pem -outform DER -out intermediate.cert.der

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out chain-signer.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key chain-signer.key.pem -subj '/CN=STYNX Test Chain Signer' -out chain-signer.csr.pem
"$OPENSSL_3" x509 -req -in chain-signer.csr.pem -CA intermediate.cert.pem -CAkey intermediate.key.pem \
  -set_serial 1004 -days 365 -sha256 -extfile signer.ext -out chain-signer.cert.pem 2>/dev/null
"$OPENSSL_3" x509 -in chain-signer.cert.pem -outform DER -out chain-signer.cert.der

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out bad-responder.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key bad-responder.key.pem -subj '/CN=STYNX Bad OCSP Responder' -out bad-responder.csr.pem
cat > bad-responder.ext <<'EXT'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EXT
"$OPENSSL_3" x509 -req -in bad-responder.csr.pem -CA root.cert.pem -CAkey root.key.pem \
  -set_serial 1007 -days 365 -sha256 -extfile bad-responder.ext -out bad-responder.cert.pem 2>/dev/null

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out expired-tsa.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key expired-tsa.key.pem -subj '/CN=STYNX Expiring TSA' -out expired-tsa.csr.pem
"$OPENSSL_3" x509 -req -in expired-tsa.csr.pem -CA root.cert.pem -CAkey root.key.pem \
  -set_serial 1005 -days 1 -sha256 -extfile tsa.ext -out expired-tsa.cert.pem 2>/dev/null

STYNX_OUTPUT_PREFIX=pades-revoked-intermediate STYNX_SIGNER_KIND=chain-signer \
  STYNX_SIGNER_ISSUER_KIND=intermediate STYNX_REVOKE_INTERMEDIATE_OCSP=1 \
  python3 build-pades-blt.py
STYNX_OUTPUT_PREFIX=pades-bad-responder STYNX_OCSP_RESPONDER_KIND=bad-responder \
  python3 build-pades-blt.py
STYNX_OUTPUT_PREFIX=pades-expired-tsa STYNX_TSA_KIND=expired-tsa \
  python3 build-pades-blt.py
STYNX_OUTPUT_PREFIX=pades-xref-stream STYNX_FINAL_XREF_KIND=stream \
  python3 build-pades-blt.py
STYNX_OUTPUT_PREFIX=pades-hybrid-xref STYNX_FINAL_XREF_KIND=hybrid \
  python3 build-pades-blt.py
rm -f intermediate.csr.pem chain-signer.csr.pem bad-responder.csr.pem expired-tsa.csr.pem \
  intermediate.ext bad-responder.ext \
  pades-revoked-intermediate-blt-timestamp.tsr pades-bad-responder-blt-timestamp.tsr \
  pades-expired-tsa-blt-timestamp.tsr pades-xref-stream-blt-timestamp.tsr \
  pades-hybrid-xref-blt-timestamp.tsr
