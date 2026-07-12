import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isVeraPdfDockerUsable, makeIntegrationValidator } from './docker-support';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('VeraPdfDockerValidator known-bad fixture', () => {
  it('normalizes at least one rule violation for a broken PDF/A-2b fixture', async () => {
    const validator = makeIntegrationValidator();
    const pdf = readFixture('bad-2b-missing-cidset.pdf');

    const result = await validator.validate(pdf);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.map((error) => error.ruleId).join(',')).toMatch(/6\.2\.11|6-2-11/u);
  });
});

function readFixture(name: string): Uint8Array {
  return readFileSync(join(__dirname, '..', 'fixtures', name));
}
