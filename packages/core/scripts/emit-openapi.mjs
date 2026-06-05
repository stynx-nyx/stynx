import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, '../../..');
const sourcePath = resolve(workspaceRoot, 'docs/framework/api/openapi.json');
const outputPath = resolve(currentDir, '../dist/openapi/openapi.json');

const raw = await readFile(sourcePath, 'utf8');
const parsed = JSON.parse(raw);

if (!parsed || typeof parsed !== 'object' || typeof parsed.openapi !== 'string') {
  throw new Error(`Invalid OpenAPI document at ${sourcePath}`);
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);
