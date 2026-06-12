import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VeraPdfDockerValidator } from '../../src';
import { isVeraPdfDockerUsable } from './docker-support';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('PDF/A fixture corpus', () => {
  it('validates the known-good PDF/A-2b fixture', async () => {
    const validator = new VeraPdfDockerValidator();

    const good = await validator.validate(readFixture('good-2b-minimal.pdf'));
    expect(good.valid).toBe(true);
    expect(good.declared).toEqual({ version: 'A-2', conformance: 'b' });
    expect(good.errors).toEqual([]);
  });

  it('rejects a PDF/A-2b fixture with a missing CIDSet', async () => {
    const validator = new VeraPdfDockerValidator();

    const missingCidSet = await validator.validate(readFixture('bad-2b-missing-cidset.pdf'));
    expect(missingCidSet.valid).toBe(false);
    expect(ruleIds(missingCidSet)).toMatch(/6\.2\.11|6-2-11/u);
  });

  it('rejects a PDF/A-2b fixture with a missing output intent', async () => {
    const validator = new VeraPdfDockerValidator();
    const missingOutputIntent = await validator.validate(readFixture('bad-2b-missing-output-intent.pdf'));
    expect(missingOutputIntent.valid).toBe(false);
    expect(ruleIds(missingOutputIntent)).toMatch(/6\.2\.2|6-2-2/u);
  });

  it('accepts the borderline fixture for PDF/A-2b', async () => {
    const validator = new VeraPdfDockerValidator();
    const borderline2b = await validator.validate(readFixture('borderline-2b-not-tagged.pdf'), {
      version: 'A-2',
      conformance: 'b',
    });
    expect(borderline2b.valid).toBe(true);
  });

  it('rejects the borderline fixture for PDF/A-2a', async () => {
    const validator = new VeraPdfDockerValidator();
    const borderline2a = await validator.validate(readFixture('borderline-2b-not-tagged.pdf'), {
      version: 'A-2',
      conformance: 'a',
    });
    expect(borderline2a.valid).toBe(false);
  });

  it('rejects a non-PDF/A vanilla PDF', async () => {
    const validator = new VeraPdfDockerValidator();
    const vanilla = await validator.validate(readFixture('non-pdfa-vanilla.pdf'));
    expect(vanilla.valid).toBe(false);
    expect(vanilla.declared).toBe(null);
  });
});

function readFixture(name: string): Uint8Array {
  return readFileSync(join(__dirname, '..', 'fixtures', name));
}

function ruleIds(result: { errors: Array<{ ruleId: string }> }): string {
  return result.errors.map((error) => error.ruleId).join(',');
}
