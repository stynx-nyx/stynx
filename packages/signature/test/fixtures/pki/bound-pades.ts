import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A real B-LT incremental PDF with the manifest hash in the signed revision. */
export function buildManifestBoundPades(
  manifestSha256: string,
  signer: 'A' | 'B' = 'A',
  attached = false,
): {
  sourceDocument: Uint8Array;
  signedDocument: Uint8Array;
  cmsSignature: Uint8Array;
  timestampToken: Uint8Array;
} {
  if (!/^[a-f0-9]{64}$/u.test(manifestSha256)) throw new Error('manifest hash must be SHA-256');
  const temporary = mkdtempSync(join(tmpdir(), 'stynx-manifest-pades-'));
  try {
    const result = spawnSync('python3', [join(__dirname, 'build-pades-blt.py')], {
      env: {
        ...process.env,
        STYNX_OUTPUT_DIR: temporary,
        STYNX_MANIFEST_SHA256: manifestSha256,
        STYNX_SIGNER_KIND: signer === 'A' ? 'signer' : 'spoof',
        ...(attached ? { STYNX_ATTACHED_CMS: '1' } : {}),
      },
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(`PAdES fixture generation failed: ${result.stderr}`);
    const read = (name: string) => readFileSync(join(temporary, name));
    return {
      sourceDocument: read('pades-source.pdf'),
      signedDocument: read('pades-blt.pdf'),
      cmsSignature: read('pades-blt.cms.der'),
      timestampToken: read('pades-blt-timestamp.tsr'),
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
