import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeSourceHash } from './source-hash.mjs';

const SCHEMA_VERSION = 1;
const REQUIRED_JOBS = ['all-linux', 'stynx-release'];
const DEFAULT_ALLOWED_PLATFORMS = ['linux/arm64', 'linux/amd64'];

function usage() {
  process.stderr.write(`Usage: node scripts/evidence/collect-local-evidence.mjs \\
  --all-linux <artifact-dir> \\
  --stynx-release <artifact-dir> \\
  [--output .ci/evidence/local-ci.json]\n`);
}

function parseArgs(argv) {
  const args = {
    output: '.ci/evidence/local-ci.json',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--all-linux' || arg === '--stynx-release' || arg === '--output') {
      if (!next) {
        throw new Error(`${arg} requires a value`);
      }
      args[arg.slice(2)] = next;
      index += 1;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readMetadata(artifactDir) {
  const metadataPath = join(artifactDir, 'metadata.txt');
  if (!existsSync(metadataPath)) {
    throw new Error(`Missing local CI metadata: ${metadataPath}`);
  }

  const metadata = {};
  for (const line of readFileSync(metadataPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    metadata[line.slice(0, separator)] = line.slice(separator + 1);
  }

  return metadata;
}

function collectFiles(root, current = root, files = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = join(current, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, fullPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function checksumDirectory(artifactDir) {
  const files = collectFiles(artifactDir).sort((left, right) =>
    relative(artifactDir, left).localeCompare(relative(artifactDir, right)),
  );
  const rootHash = createHash('sha256');

  for (const file of files) {
    const content = readFileSync(file);
    rootHash.update(relative(artifactDir, file));
    rootHash.update('\0');
    rootHash.update(String(content.length));
    rootHash.update('\0');
    rootHash.update(createHash('sha256').update(content).digest('hex'));
    rootHash.update('\0');
  }

  return {
    algorithm: 'sha256',
    value: rootHash.digest('hex'),
    fileCount: files.length,
  };
}

function packagePolicy() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const packageManager = packageJson.packageManager || '';
  const pnpmVersion = packageManager.startsWith('pnpm@')
    ? packageManager.slice('pnpm@'.length)
    : '';

  return {
    node: packageJson.engines?.node || '',
    pnpm: pnpmVersion,
  };
}

function jobEntry(job, artifactDir) {
  if (!existsSync(artifactDir) || !statSync(artifactDir).isDirectory()) {
    throw new Error(`Local CI artifact directory does not exist: ${artifactDir}`);
  }

  const metadata = readMetadata(artifactDir);
  if (metadata.job !== job) {
    throw new Error(`Expected ${artifactDir} to contain job=${job}, got job=${metadata.job || ''}`);
  }

  return {
    result: 'success',
    artifactDir,
    metadata,
    artifactChecksum: checksumDirectory(artifactDir),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  for (const job of REQUIRED_JOBS) {
    if (!args[job]) {
      usage();
      throw new Error(`Missing --${job}`);
    }
  }

  const jobs = Object.fromEntries(REQUIRED_JOBS.map((job) => [job, jobEntry(job, args[job])]));
  const platforms = [...new Set(REQUIRED_JOBS.map((job) => jobs[job].metadata.platform).filter(Boolean))];
  const policy = packagePolicy();
  const nodeVersions = [...new Set(REQUIRED_JOBS.map((job) => jobs[job].metadata.node).filter(Boolean))];
  const pnpmVersions = [...new Set(REQUIRED_JOBS.map((job) => jobs[job].metadata.pnpm).filter(Boolean))];
  const dockerVersions = [...new Set(REQUIRED_JOBS.map((job) => jobs[job].metadata.docker).filter(Boolean))];
  const dockerComposeVersions = [
    ...new Set(REQUIRED_JOBS.map((job) => jobs[job].metadata.docker_compose).filter(Boolean)),
  ];

  const manifest = {
    $schema: './schema.json',
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sourceHash: computeSourceHash(),
    policy: {
      maxAgeHours: 24,
      requiredJobs: REQUIRED_JOBS,
      allowedPlatforms: DEFAULT_ALLOWED_PLATFORMS,
    },
    tools: {
      node: {
        expected: policy.node,
        observed: nodeVersions,
      },
      pnpm: {
        expected: policy.pnpm,
        observed: pnpmVersions,
      },
      docker: {
        observed: dockerVersions,
      },
      dockerCompose: {
        observed: dockerComposeVersions,
      },
    },
    platforms,
    jobs,
  };

  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote ${args.output}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
