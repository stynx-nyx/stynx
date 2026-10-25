import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const [root, mode, population = 'node'] = process.argv.slice(2);
const require = createRequire(resolve(root, 'tools/eslint-config/package.json'));
const { ESLint } = require('eslint');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const files = population === 'image-size'
  ? readdirSync(resolve(root, 'tools/image-size-safe/lib'), { recursive: true }).filter(file => file.endsWith('.ts')).map(file => `tools/image-size-safe/lib/${file}`).sort()
  : JSON.parse(readFileSync(new URL('./node-implementation-files.json', import.meta.url), 'utf8'));
const names = ['@typescript-eslint/no-explicit-any', ...Object.keys(tsPlugin.rules).filter(name => name.startsWith('no-unsafe-')).map(name => `@typescript-eslint/${name}`), 'stynx/no-raw-query', 'stynx/define-query-location', '@typescript-eslint/no-require-imports', 'stynx/no-authored-cjs'];
const configFile = resolve(root, mode === 'root' ? 'eslint.config.mjs' : 'tools/eslint-config/workspace-maintained.mjs');
const rows = [];
const witnesses = [];
const imageBoundary = {};
const ignored = {};
let outsidePopulation;
try {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: configFile });
  for (const file of files) {
    const filename = resolve(root, file);
    const config = await eslint.calculateConfigForFile(filename);
    const row = { file, configured: !!config };
    if (config) {
      const language = config.languageOptions;
      row.sourceType = language.sourceType;
      row.rules = Object.fromEntries(names.map(name => [name, config.rules?.[name]?.[0] ?? 0]));
      const options = { ...language.parserOptions, filePath: filename, ecmaVersion: language.ecmaVersion, sourceType: language.sourceType };
      try {
        const parsed = language.parser.parseForESLint ? language.parser.parseForESLint(readFileSync(filename, 'utf8'), options) : { ast: language.parser.parse(readFileSync(filename, 'utf8'), options) };
        const program = parsed.services?.program;
        row.hasProgram = !!program;
        row.belongs = !!program?.getSourceFile(filename);
        row.allowJs = program?.getCompilerOptions().allowJs;
        row.checkJs = program?.getCompilerOptions().checkJs;
        if (population === 'image-size' && program) {
          const options = program.getCompilerOptions();
          row.compiler = { module: options.module, moduleResolution: options.moduleResolution, strict: options.strict, lib: options.lib };
        }
      } catch (error) { row.error = { name: error.name, message: error.message }; }
    }
    rows.push(row);
  }
  for (const file of population === 'image-size' ? (rows.every(row => row.hasProgram) ? ['tools/image-size-safe/lib/index.ts'] : []) : ['scripts/clean-workspace.mjs', 'scripts/lib/http-build-observer.cjs']) {
    const [result] = await eslint.lintText((population === 'image-size' ? 'const explicit: any = 1; void explicit;\n' : '') + 'const unchecked = JSON.parse("{}"); unchecked.execute();\n', { filePath: resolve(root, file) });
    witnesses.push({ file, messages: result.messages });
  }
  if (population === 'image-size') {
    for (const file of ['dist/inspector.ts', 'build/inspector.ts', 'node_modules/inspector.ts', 'lib/generated/inspector.ts']) ignored[file] = await eslint.isPathIgnored(resolve(root, 'tools/image-size-safe', file));
    const outside = await eslint.calculateConfigForFile(resolve(root, 'tools/image-size-safe/lib/generated/inspector.ts'));
    outsidePopulation = { configured: !!outside, project: outside?.languageOptions?.parserOptions?.project ?? null };
    if (rows.every(row => row.hasProgram)) {
      const filePath = resolve(root, 'tools/image-size-safe/lib/index.ts');
      const original = readFileSync(filePath, 'utf8');
      for (const [kind, source] of [['self', original], ['forbidden', original + '\nimport * as InspectorForbiddenCore from "@stynx-nyx/core"; void InspectorForbiddenCore;\n']]) {
        const [result] = await eslint.lintText(source, { filePath });
        imageBoundary[kind] = result.messages.filter(message => message.fatal || message.ruleId === null || message.ruleId?.startsWith('boundaries/'));
      }
    }
  }
  console.log(JSON.stringify({ mode, files, names, rows, witnesses, imageBoundary, ignored, outsidePopulation }));
} catch (error) {
  console.log(JSON.stringify({ mode, files, error: { name: error.name, message: error.message }, rows }));
  process.exitCode = 1;
}
