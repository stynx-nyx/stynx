import { describe, expect, it } from 'vitest';
import { readLtaPdfEvidence } from '../../src/pdf-trust-evidence.js';
import { ltaBytes, ltaInput, ltaVerifier } from '../support/lta-fixture.js';

describe('minimal LTA archive token container admission', () => {
  const original = ltaBytes('minimal-lta.pdf');
  const ranges = [
    ...original.toString('latin1').matchAll(/\/ByteRange\s*\[(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\]/gu),
  ].map((match) => match.slice(1).map(Number));
  const approvalEnd = ranges[0]![2]! + ranges[0]![3]!;
  const archiveRange = ranges.at(-1)!;

  it('extracts exactly the original DER token and excludes its zero placeholder padding', async () => {
    const parsed = await readLtaPdfEvidence(original, approvalEnd, ltaBytes('signature.cms.der'));
    expect(Buffer.from(parsed.token)).toEqual(ltaBytes('minimal-lta.token.der'));
    expect(Buffer.from(parsed.covered)).toEqual(
      Buffer.concat([original.subarray(0, archiveRange[1]), original.subarray(archiveRange[2])]),
    );
  });

  it.each([
    ['wrong ASN.1 tag', '3100'],
    ['indefinite DER length', '3080'],
    ['length wider than supported bytes', '30850100000000'],
    ['nonminimal leading length zero', '30820080'],
    ['long-form length for short value', '30817f'],
    ['length extending outside the PDF token gap', '3084ffffffff'],
  ])(
    'refuses %s before crypto verification while preserving the signed approval bytes',
    async (_label, encoded) => {
      const damaged = Buffer.concat([
        original.subarray(0, archiveRange[1]! + 1),
        Buffer.from(encoded!.padEnd(archiveRange[2]! - archiveRange[1]! - 2, '0')),
        original.subarray(archiveRange[2]! - 1),
      ]);
      expect(damaged.subarray(0, approvalEnd)).toEqual(original.subarray(0, approvalEnd));
      await expect(
        readLtaPdfEvidence(damaged, approvalEnd, ltaBytes('signature.cms.der')),
      ).rejects.toMatchObject({ name: 'SignatureTrustError' });
      await expect(
        ltaVerifier().verifySignedArtifact({ ...ltaInput(), signedDocument: damaged }),
      ).rejects.toMatchObject({ name: 'SignatureTrustError' });
    },
  );
});
