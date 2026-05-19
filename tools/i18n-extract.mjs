#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesWebRoot = join(repoRoot, 'packages-web');
const args = new Set(process.argv.slice(2));
const writeMode = args.has('--write');
const checkMode = args.has('--check') || !writeMode;

if (args.has('--help') || args.has('-h')) {
  printUsage();
  process.exit(0);
}

const report = {
  packages: [],
  errors: [],
};

for (const packageDir of discoverPackageDirs()) {
  const packageInfo = loadPackageInfo(packageDir);
  const sourceDir = join(packageDir, 'src');
  if (!existsSync(sourceDir)) continue;

  const scan = scanSource(packageInfo, sourceDir);
  const i18nDir = join(sourceDir, 'i18n');
  const keysPath = join(i18nDir, 'keys.json');
  const expectedKeysJson = `${JSON.stringify(scan.keys, null, 2)}\n`;
  const existingKeysJson = existsSync(keysPath) ? readFileSync(keysPath, 'utf8') : null;

  if (writeMode && scan.keys.length > 0) {
    mkdirSync(i18nDir, { recursive: true });
    if (existingKeysJson !== expectedKeysJson) {
      writeFileSync(keysPath, expectedKeysJson);
    }
  }

  const packageResult = {
    name: packageInfo.name,
    dir: relative(repoRoot, packageDir),
    keyCount: scan.keys.length,
    literalCount: scan.literals.length,
    keysPath: relative(repoRoot, keysPath),
  };
  report.packages.push(packageResult);

  if (checkMode) {
    if (scan.keys.length > 0 && existingKeysJson !== expectedKeysJson) {
      report.errors.push({
        package: packageInfo.name,
        type: 'keys-json-out-of-date',
        message: `${relative(repoRoot, keysPath)} is missing or out of date. Run pnpm i18n:extract.`,
      });
    }

    validateCatalog(packageInfo.name, packageDir, 'en', scan.keys, scan.dynamicPrefixes);
    validateCatalog(packageInfo.name, packageDir, 'pt-BR', scan.keys, scan.dynamicPrefixes);

    for (const literal of scan.literals) {
      report.errors.push({
        package: packageInfo.name,
        type: 'raw-ui-literal',
        message: `${literal.file}:${literal.line} contains untranslated UI text: ${JSON.stringify(literal.text)}`,
      });
    }
  }
}

printReport(report, writeMode);

if (checkMode && report.errors.length > 0) {
  process.exit(1);
}

function printUsage() {
  process.stdout.write(`Usage: node tools/i18n-extract.mjs [--check|--write]

Scans packages-web/*/src for runtime i18n keys and static template text.

Modes:
  --write   write packages-web/<pkg>/src/i18n/keys.json for packages with keys
  --check   verify keys.json, en.json, pt-BR.json, and untranslated template text

Default mode is --check.
`);
}

function discoverPackageDirs() {
  if (!existsSync(packagesWebRoot)) return [];

  return readdirSync(packagesWebRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesWebRoot, entry.name))
    .filter((dir) => existsSync(join(dir, 'package.json')))
    .sort((a, b) => a.localeCompare(b));
}

function loadPackageInfo(packageDir) {
  const packageJson = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const name = packageJson.name ?? relative(repoRoot, packageDir);
  return {
    name,
    namespace: packageNamespace(name, packageDir),
  };
}

function packageNamespace(packageName, packageDir) {
  const localName = packageName.includes('/') ? packageName.split('/').at(-1) : packageName;
  if (localName?.startsWith('angular-')) return localName.slice('angular-'.length);
  return localName ?? relative(packagesWebRoot, packageDir);
}

function scanSource(packageInfo, sourceDir) {
  const keySet = new Set();
  const dynamicPrefixes = new Set();
  const literals = [];

  for (const file of walkFiles(sourceDir)) {
    if (file.includes(`${sep()}generated${sep()}`)) continue;
    if (!file.endsWith('.ts') && !file.endsWith('.html')) continue;

    const source = readFileSync(file, 'utf8');
    collectTranslateKeys(source, keySet);
    if (file.endsWith('.ts')) {
      collectNamespacedStringKeys(source, packageInfo.namespace, keySet);
      collectDynamicKeyPrefixes(source, packageInfo.namespace, dynamicPrefixes);
    }

    if (file.endsWith('.component.html')) {
      collectTemplateLiterals(source, relative(repoRoot, file), literals);
    } else if (file.endsWith('.component.ts')) {
      for (const template of extractInlineTemplates(source)) {
        collectTemplateLiterals(template.value, relative(repoRoot, file), literals, template.lineOffset);
      }
    }
  }

  return {
    keys: [...keySet].sort((a, b) => a.localeCompare(b)),
    dynamicPrefixes: [...dynamicPrefixes].sort((a, b) => a.localeCompare(b)),
    literals,
  };
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      yield* walkFiles(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

function sep() {
  return process.platform === 'win32' ? '\\' : '/';
}

function collectTranslateKeys(source, keySet) {
  const pipePattern = /(['"`])([a-z][a-z0-9-]*(?:\.[a-zA-Z0-9_-]+)+)\1\s*\|\s*(?:stynxTranslate|translate)\b/g;
  const methodPattern = /\b(?:i18n|i18nService|stynxI18n|this\.i18n|this\.i18nService|this\.stynxI18n)\.translate\(\s*(['"`])([a-z][a-z0-9-]*(?:\.[a-zA-Z0-9_-]+)+)\1/g;

  for (const match of source.matchAll(pipePattern)) {
    keySet.add(match[2]);
  }
  for (const match of source.matchAll(methodPattern)) {
    keySet.add(match[2]);
  }
}

function collectNamespacedStringKeys(source, namespace, keySet) {
  if (!namespace) return;

  const keyPattern = new RegExp(`(['"\`])(${escapeRegExp(namespace)}\\.[a-zA-Z0-9_.-]+)\\1`, 'g');
  for (const match of source.matchAll(keyPattern)) {
    keySet.add(match[2]);
  }
}

function collectDynamicKeyPrefixes(source, namespace, prefixes) {
  if (!namespace) return;

  const pattern = new RegExp(`\`(${escapeRegExp(namespace)}\\.[^\`$]+)\\$\\{`, 'g');
  for (const match of source.matchAll(pattern)) {
    prefixes.add(match[1]);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractInlineTemplates(source) {
  const templates = [];
  const pattern = /template\s*:\s*(`([\s\S]*?)`|'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)")/g;

  for (const match of source.matchAll(pattern)) {
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    templates.push({
      value: raw.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\`/g, '`'),
      lineOffset: countLines(source.slice(0, match.index)),
    });
  }

  return templates;
}

function collectTemplateLiterals(template, file, literals, lineOffset = 0) {
  const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '');
  collectTextNodeLiterals(withoutComments, file, literals, lineOffset);
  collectAttributeLiterals(withoutComments, file, literals, lineOffset);
}

function collectTextNodeLiterals(template, file, literals, lineOffset) {
  for (const node of extractTextNodes(template)) {
    const text = normaliseTemplateText(node.value);
    if (!isUserVisibleLiteral(text)) continue;
    literals.push({
      file,
      line: lineOffset + countLines(template.slice(0, node.index)),
      text,
    });
  }
}

function extractTextNodes(template) {
  const nodes = [];
  let inTag = false;
  let quote = null;
  let buffer = '';
  let bufferStart = 0;

  for (let index = 0; index < template.length; index += 1) {
    const char = template[index];

    if (inTag) {
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        inTag = false;
        bufferStart = index + 1;
      }
      continue;
    }

    if (char === '<') {
      if (buffer.trim()) {
        nodes.push({ value: buffer, index: bufferStart });
      }
      buffer = '';
      inTag = true;
      quote = null;
      continue;
    }

    if (!buffer) bufferStart = index;
    buffer += char;
  }

  if (buffer.trim()) {
    nodes.push({ value: buffer, index: bufferStart });
  }

  return nodes;
}

function collectAttributeLiterals(template, file, literals, lineOffset) {
  const attributes = [
    'aria-label',
    'aria-placeholder',
    'label',
    'placeholder',
    'title',
  ];
  const pattern = new RegExp(`\\b(?:${attributes.join('|')})=(["'])([^"']*[A-Za-z][^"']*)\\1`, 'g');

  for (const match of template.matchAll(pattern)) {
    const text = normaliseTemplateText(match[2]);
    if (!isUserVisibleLiteral(text)) continue;
    literals.push({
      file,
      line: lineOffset + countLines(template.slice(0, match.index)),
      text,
    });
  }
}

function normaliseTemplateText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function isUserVisibleLiteral(text) {
  if (text.length < 2) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\{\{[\s\S]*\}\}$/.test(text)) return false;
  if (/^[@{}]/.test(text)) return false;
  if (/@(?:if|for|switch|case|else|default)\b/.test(text)) return false;
  if (/\|\s*(?:stynxTranslate|translate)\b/.test(text)) return false;
  if (/^[a-z][a-z0-9-]*(?:\.[a-zA-Z0-9_-]+)+$/.test(text)) return false;
  return true;
}

function countLines(value) {
  return value.split('\n').length;
}

function validateCatalog(packageName, packageDir, locale, sourceKeys, dynamicPrefixes = []) {
  const catalogPath = join(packageDir, 'src', 'i18n', `${locale}.json`);
  const relativeCatalogPath = relative(repoRoot, catalogPath);

  if (!existsSync(catalogPath)) {
    if (sourceKeys.length > 0) {
      report.errors.push({
        package: packageName,
        type: 'catalog-missing',
        message: `${relativeCatalogPath} is missing for ${sourceKeys.length} extracted keys.`,
      });
    }
    return;
  }

  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    report.errors.push({
      package: packageName,
      type: 'catalog-invalid-json',
      message: `${relativeCatalogPath} is not valid JSON: ${error.message}`,
    });
    return;
  }

  const catalogKeys = flattenCatalogKeys(catalog);
  const missing = sourceKeys.filter((key) => !catalogKeys.has(key));
  const stale = [...catalogKeys]
    .filter((key) => !sourceKeys.includes(key) && !dynamicPrefixes.some((prefix) => key.startsWith(prefix)))
    .sort((a, b) => a.localeCompare(b));

  if (missing.length > 0) {
    report.errors.push({
      package: packageName,
      type: 'catalog-missing-keys',
      message: `${relativeCatalogPath} is missing keys: ${missing.join(', ')}`,
    });
  }
  if (stale.length > 0) {
    report.errors.push({
      package: packageName,
      type: 'catalog-stale-keys',
      message: `${relativeCatalogPath} has stale keys: ${stale.join(', ')}`,
    });
  }
}

function flattenCatalogKeys(value, prefix = '', out = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;

  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenCatalogKeys(child, next, out);
    } else {
      out.add(next);
    }
  }

  return out;
}

function printReport(value, isWriteMode = false) {
  for (const item of value.packages) {
    process.stdout.write(`${item.dir}: ${item.keyCount} keys, ${item.literalCount} untranslated literals\n`);
  }

  if (value.errors.length === 0) {
    process.stdout.write(isWriteMode ? 'i18n extraction completed.\n' : 'i18n extraction check passed.\n');
    return;
  }

  process.stderr.write(`i18n extraction check failed with ${value.errors.length} issue(s):\n`);
  for (const error of value.errors) {
    process.stderr.write(`- [${error.package}] ${error.message}\n`);
  }
}
