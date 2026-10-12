import { runFreshHttpQualificationBatch } from './lib/http-fresh-build.mjs';

// Fixed entry; no ambient stack, alternate roster, receipt or resume path.
if (process.argv.length !== 4 || process.argv[2] !== '--scenario' || process.argv[3] !== 'all') {
  process.stderr.write('Usage: node scripts/run-http-performance.mjs --scenario all\n');
  process.exitCode = 2;
} else {
  try {
    const report = await runFreshHttpQualificationBatch();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.overallVerdict === 'PASS' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.code ?? 'HTTP_QUALIFICATION_BATCH_REFUSED'}\n`);
    process.exitCode = 1;
  }
}
