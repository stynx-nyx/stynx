import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const EVIDENCE_PREFIX = '.ci/evidence/';

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8').trim();
    throw new Error(stderr || `git ${args.join(' ')} failed`);
  }

  return result.stdout;
}

function trackedFiles() {
  return runGit(['ls-files', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => file !== '.ci/evidence' && !file.startsWith(EVIDENCE_PREFIX))
    .sort();
}

export function computeSourceHash() {
  const files = trackedFiles();
  const rootHash = createHash('sha256');

  for (const file of files) {
    rootHash.update(file);
    rootHash.update('\0');

    if (!existsSync(file)) {
      rootHash.update('deleted');
      rootHash.update('\0');
      continue;
    }

    const content = readFileSync(file);
    const fileHash = createHash('sha256').update(content).digest('hex');
    rootHash.update(String(content.length));
    rootHash.update('\0');
    rootHash.update(fileHash);
    rootHash.update('\0');
  }

  return {
    algorithm: 'sha256',
    value: rootHash.digest('hex'),
    fileCount: files.length,
  };
}

function main() {
  const asJson = process.argv.includes('--json');
  const sourceHash = computeSourceHash();

  if (asJson) {
    process.stdout.write(`${JSON.stringify(sourceHash, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${sourceHash.value}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
