import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(testDir, '../../.test-results/a11y.json');
const lockPath = resolve(testDir, '../../.test-results/a11y.lock');

export default async function globalSetup() {
  await mkdir(dirname(reportPath), { recursive: true });
  await rm(lockPath, { recursive: true, force: true });
  await writeFile(reportPath, '[]\n', 'utf8');
}
