import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VeraPdfDockerValidator } from '../../src';
import { isVeraPdfDockerUsable } from '../integration/docker-support';

const describeIfDocker = isVeraPdfDockerUsable() ? describe : describe.skip;

describeIfDocker('veraPDF Docker throughput', () => {
  it('keeps warm p95 and cold validation within the R12 budget', async () => {
    const pdf = readFileSync(join(__dirname, '..', 'fixtures', 'good-2b-minimal.pdf'));
    const validator = new VeraPdfDockerValidator();

    const coldStarted = Date.now();
    const cold = await validator.validate(pdf);
    const coldMs = Date.now() - coldStarted;
    expect(cold.valid).toBe(true);
    expect(coldMs).toBeLessThanOrEqual(5_000);

    await validator.validate(pdf);
    const samples: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const started = Date.now();
      await validator.validate(pdf);
      samples.push(Date.now() - started);
    }
    const p95 = percentile95(samples);
    expect(p95).toBeLessThanOrEqual(500);
  });
});

function percentile95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}
