import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VeraPdfDockerValidator } from '../../src';
import { isVeraPdfDockerUsable } from './docker-support';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('VeraPdfDockerValidator known-good fixture', () => {
  it('validates the known-good PDF/A-2b fixture', async () => {
    const validator = new VeraPdfDockerValidator();
    const pdf = readFixture('good-2b-minimal.pdf');

    const result = await validator.validate(pdf);

    expect(result.valid).toBe(true);
    expect(result.declared).toEqual({ version: 'A-2', conformance: 'b' });
    expect(result.errors).toEqual([]);
  });
});

function readFixture(name: string): Uint8Array {
  return readFileSync(join(__dirname, '..', 'fixtures', name));
}
