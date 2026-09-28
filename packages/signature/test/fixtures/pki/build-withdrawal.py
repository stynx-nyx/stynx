"""Generate a PDF declaration bound to the canonical withdrawal fields."""
from pathlib import Path
import hashlib
import json
import os
import subprocess

root = Path(__file__).resolve().parent
record = {
    'tenantId': 'tenant-a',
    'caseId': 'case-a',
    'documentId': 'document-a',
    'contentHash': hashlib.sha256((root / 'document.bin').read_bytes()).hexdigest(),
    'signerPartyId': 'party-a',
    'evidenceRef': 'attestation-a',
}
canonical = json.dumps(record, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()
(root / 'withdrawal-declaration.json').write_bytes(canonical)
env = dict(os.environ)
env['STYNX_WITHDRAWAL_SHA256'] = hashlib.sha256(canonical).hexdigest()
env.setdefault('STYNX_OUTPUT_PREFIX', 'withdrawal')
subprocess.run(['python3', str(root / 'build-pades-blt.py')], env=env, check=True)
