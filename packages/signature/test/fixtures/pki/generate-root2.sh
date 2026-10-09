#!/bin/sh
# Second, disjoint test PKI root for the trust-profile-set proofs
# (ADR-SIGNATURE-0002 D2, UPS-SIG-07): its own signer and TSA and one B-LT PDF
# signed under it. Nothing here chains to root.cert.pem. Runs on its own so the
# first root's fixtures stay byte-identical (OpenSSL 3).
set -eu
cd "$(dirname "$0")"
OPENSSL_3=${OPENSSL_3:-/opt/homebrew/opt/openssl@3/bin/openssl}
if [ ! -x "$OPENSSL_3" ]; then OPENSSL_3=openssl; fi

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out root2.key.pem 2>/dev/null
"$OPENSSL_3" req -x509 -new -key root2.key.pem -days 3650 -sha256 -config root2.cnf -out root2.cert.pem

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out signer2.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key signer2.key.pem -subj '/CN=STYNX Test Signer 2' -out signer2.csr.pem
"$OPENSSL_3" x509 -req -in signer2.csr.pem -CA root2.cert.pem -CAkey root2.key.pem \
  -set_serial 2001 -days 365 -sha256 -extfile signer.ext -out signer2.cert.pem 2>/dev/null
"$OPENSSL_3" x509 -in signer2.cert.pem -outform DER -out signer2.cert.der

"$OPENSSL_3" genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out tsa2.key.pem 2>/dev/null
"$OPENSSL_3" req -new -key tsa2.key.pem -subj '/CN=STYNX Test TSA 2' -out tsa2.csr.pem
"$OPENSSL_3" x509 -req -in tsa2.csr.pem -CA root2.cert.pem -CAkey root2.key.pem \
  -set_serial 2002 -days 365 -sha256 -extfile tsa.ext -out tsa2.cert.pem 2>/dev/null

STYNX_ROOT_KIND=root2 STYNX_SIGNER_KIND=signer2 STYNX_TSA_KIND=tsa2 \
  STYNX_OUTPUT_PREFIX=pades-root2 python3 build-pades-blt.py
rm -f signer2.csr.pem tsa2.csr.pem pades-root2-blt-timestamp.tsr
