import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
const repoRoot = resolve(siteRoot, '..', '..');
const apiOutDir = resolve(siteRoot, '.generated/site-docs/api-reference');
const typeDocBin = resolve(
  siteRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'typedoc.cmd' : 'typedoc',
);

/** @param {unknown} value @param {string} key @returns {unknown} */
function readJsonProperty(value, key) {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  /** @type {unknown} */
  const boxed = Object(value);
  if (typeof boxed !== 'object' || boxed === null) {
    throw new TypeError('Object conversion did not produce an object');
  }
  /** @type {unknown} */
  const result = Reflect.get(boxed, key, value);
  return result;
}

/** @param {unknown} manifest @returns {string} */
function selectedPackageName(manifest) {
  const name = readJsonProperty(manifest, 'name');
  if (typeof name !== 'string') {
    throw new TypeError('Selected package name is not a string');
  }
  return name;
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function spreadJsonProperties(value) {
  if (value === null || value === undefined) return {};
  /** @type {unknown} */
  const boxed = Object(value);
  if (typeof boxed !== 'object' || boxed === null) {
    throw new TypeError('Object conversion did not produce an object');
  }
  return Object.fromEntries(Object.entries(boxed));
}

/**
 * @param {string} baseDir
 * @param {(name: unknown) => boolean} matcher
 */
function collectPackages(baseDir, matcher) {
  const resolvedBase = resolve(repoRoot, baseDir);
  return readdirSync(resolvedBase)
    .map((entry) => resolve(resolvedBase, entry))
    .filter((dirPath) => existsSync(resolve(dirPath, 'package.json')))
    .filter((dirPath) => isTrackedFile(resolve(dirPath, 'package.json')))
    .map((dirPath) => {
      /** @type {unknown} */
      const manifest = JSON.parse(readFileSync(resolve(dirPath, 'package.json'), 'utf8'));
      return { dirPath, manifest };
    })
    .filter(({ manifest }) => matcher(readJsonProperty(manifest, 'name')))
    .filter(({ dirPath }) => existsSync(resolve(dirPath, 'src/index.ts')));
}

/**
 * @param {string} filePath
 */
function isTrackedFile(filePath) {
  const relativePath = relative(repoRoot, filePath).split(sep).join('/');
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  return result.status === 0;
}

/** @param {{dirPath: string, manifest: unknown}[]} packages */
function renderIndex(packages) {
  const lines = [
    '---',
    'title: API Reference',
    '---',
    '',
    '# API Reference',
    '',
    'Generated API reference for every `@stynx-nyx/*` and `@stynx-nyx/*` package.',
    '',
  ];

  for (const pkg of packages) {
    const slug = selectedPackageName(pkg.manifest).replace(/^@/u, '').replace(/\//gu, '-');
    lines.push(`- [${selectedPackageName(pkg.manifest)}](./${slug}/)`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} dirPath
 * @returns {string[]}
 */
function collectMarkdownFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * @param {string} targetDir
 */
function normalizePackageIndex(targetDir) {
  const readmePath = resolve(targetDir, 'README.md');
  const indexPath = resolve(targetDir, 'index.md');
  if (existsSync(readmePath)) {
    renameSync(readmePath, indexPath);
  }
}

/** @param {{dirPath: string, manifest: unknown}} pkg @param {string} targetDir */
function ensurePackageIndex(pkg, targetDir) {
  const indexPath = resolve(targetDir, 'index.md');
  if (existsSync(indexPath)) {
    return;
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    indexPath,
    [
      '---',
      `title: ${JSON.stringify(selectedPackageName(pkg.manifest))}`,
      '---',
      '',
      `# ${selectedPackageName(pkg.manifest)}`,
      '',
      'TypeDoc did not emit public API pages for this package in the current build.',
      '',
    ].join('\n'),
  );
}

/**
 * @param {string} targetDir
 */
function rewriteReadmeLinks(targetDir) {
  const files = collectMarkdownFiles(targetDir);
  for (const filePath of files) {
    const original = readFileSync(filePath, 'utf8');
    const updated = original
      .replace(/\(([^)\s]*?)README\.md((?:#[^)]+)?)\)/gu, '($1index.md$2)')
      .replace(/^- \[([^\]]+)\]\(@[^)\s]+\)$/gmu, '- `$1`');
    if (updated !== original) {
      writeFileSync(filePath, updated);
    }
    if (updated.includes('README.md')) {
      throw new Error(`Unrewritten README link remains in ${filePath}`);
    }
  }
}

/**
 * @param {string} rootDir
 */
function rewriteMissingLocalMarkdownLinks(rootDir) {
  const files = collectMarkdownFiles(rootDir);
  const existingFiles = new Set(files.map((filePath) => resolve(filePath)));
  let rewriteCount = 0;

  for (const filePath of files) {
    const original = readFileSync(filePath, 'utf8');
    const updated = original.replace(
      /\[([^\]\n]+)\]\(([^)\s]+\.md(?:#[^)]+)?)\)/gu,
      /**
       * @param {string} match
       * @param {string} label
       * @param {string} target
       */
      (match, label, target) => {
        if (/^(?:https?:|mailto:|#|\/)/u.test(target)) {
          return match;
        }

        const [targetPath] = target.split('#');
        let decodedTargetPath;
        try {
          decodedTargetPath = decodeURIComponent(targetPath);
        } catch {
          decodedTargetPath = targetPath;
        }

        const resolvedTarget = resolve(dirname(filePath), decodedTargetPath);
        if (existingFiles.has(resolvedTarget)) {
          return match;
        }

        rewriteCount += 1;
        return label.replace(/\\([\][\\])/gu, '$1');
      },
    );

    if (updated !== original) {
      writeFileSync(filePath, updated);
    }
  }

  if (rewriteCount > 0) {
    console.log(
      `Rewrote ${rewriteCount} generated TypeDoc links to missing local markdown targets.`,
    );
  }
}

/** @param {{dirPath: string, manifest: unknown}} pkg */
function writeTypeDocTsconfig(pkg) {
  const tsconfigPath = resolve(pkg.dirPath, 'tsconfig.json');
  const targetDir = resolve(pkg.dirPath, '.typedoc');
  const targetPath = resolve(targetDir, 'tsconfig.json');
  const extendsPath = relative(targetDir, tsconfigPath).split(sep).join('/');
  const compilerOptions = { ignoreDeprecations: '6.0' };
  if (selectedPackageName(pkg.manifest) === '@stynx-nyx/notifications') {
    /** @type {unknown} */
    const inherited = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    const paths = readJsonProperty(readJsonProperty(inherited, 'compilerOptions'), 'paths');
    compilerOptions.paths = {
      ...spreadJsonProperties(paths),
      '@stynx-nyx/auth': ['packages/auth/src/index.ts'],
      '@stynx-nyx/sessions': ['packages/sessions/src/index.ts'],
    };
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(
    targetPath,
    `${JSON.stringify(
      {
        extends: extendsPath.startsWith('.') ? extendsPath : `./${extendsPath}`,
        compilerOptions,
      },
      null,
      2,
    )}\n`,
  );
  return { dirPath: targetDir, tsconfigPath: targetPath };
}

/** @param {{dirPath: string, manifest: unknown}} pkg */
function typeDocOptionsFor(pkg) {
  if (selectedPackageName(pkg.manifest) === '@stynx-nyx/backend') {
    return [
      '--intentionallyNotExported',
      'src/identity-admin/pg-local-sync.adapter.ts:QueryResult',
      '--intentionallyNotExported',
      'src/auth/sql-tenant-entitlement.fallback.ts:RowResult',
    ];
  }

  if (selectedPackageName(pkg.manifest) === '@stynx-nyx/data') {
    return ['--intentionallyNotExported', 'src/schema/index.ts:schema'];
  }

  if (selectedPackageName(pkg.manifest) === '@stynx-nyx/sdk') {
    return [
      '--intentionallyNotExported',
      'src/generated/core/ApiRequestOptions.ts:ApiRequestOptions',
      '--intentionallyNotExported',
      'src/generated/core/ApiResult.ts:ApiResult',
      '--intentionallyNotExported',
      'src/generated/core/OpenAPI.ts:Headers',
      '--intentionallyNotExported',
      'src/generated/core/OpenAPI.ts:Resolver',
      '--intentionallyNotExported',
      'src/generated/GeneratedStynxSdk.ts:HttpRequestConstructor',
      '--intentionallyNotExported',
      'src/generated/core/CancelablePromise.ts:OnCancel',
      '--intentionallyNotExported',
      'src/token-store.ts:BrowserStorageLike',
    ];
  }

  return [];
}

const packages = [
  ...collectPackages(
    'packages',
    (name) => typeof name === 'string' && name.startsWith('@stynx-nyx/'),
  ),
  ...collectPackages(
    'packages-web',
    (name) => typeof name === 'string' && name.startsWith('@stynx-nyx/'),
  ),
];

rmSync(apiOutDir, { recursive: true, force: true });
mkdirSync(apiOutDir, { recursive: true });

const typedocTempDirs = [];
let failure = null;

for (const pkg of packages) {
  const slug = selectedPackageName(pkg.manifest).replace(/^@/u, '').replace(/\//gu, '-');
  const targetDir = resolve(apiOutDir, slug);
  const typedocTsconfig = writeTypeDocTsconfig(pkg);
  typedocTempDirs.push(typedocTsconfig.dirPath);
  mkdirSync(targetDir, { recursive: true });

  const result = spawnSync(
    typeDocBin,
    [
      '--plugin',
      'typedoc-plugin-markdown',
      '--entryPoints',
      'src/index.ts',
      '--tsconfig',
      typedocTsconfig.tsconfigPath,
      '--readme',
      'none',
      '--validation.invalidLink',
      'false',
      ...typeDocOptionsFor(pkg),
      '--out',
      targetDir,
    ],
    {
      cwd: pkg.dirPath,
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    failure = new Error(`TypeDoc failed for ${selectedPackageName(pkg.manifest)}`);
    break;
  }

  normalizePackageIndex(targetDir);
  rewriteReadmeLinks(targetDir);
  ensurePackageIndex(pkg, targetDir);
}

for (const dirPath of typedocTempDirs) {
  rmSync(dirPath, { recursive: true, force: true });
}

if (failure !== null) {
  throw failure;
}

for (const pkg of packages) {
  const slug = selectedPackageName(pkg.manifest).replace(/^@/u, '').replace(/\//gu, '-');
  ensurePackageIndex(pkg, resolve(apiOutDir, slug));
}

rewriteMissingLocalMarkdownLinks(apiOutDir);
writeFileSync(resolve(apiOutDir, 'index.md'), renderIndex(packages));
