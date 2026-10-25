import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [root, mode] = process.argv.slice(2);
const require = createRequire(resolve(root, 'tools/eslint-config/package.json'));
const { ESLint } = require('eslint');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const files = JSON.parse(readFileSync(new URL('./node-implementation-files.json', import.meta.url), 'utf8'));
const names = ['@typescript-eslint/no-explicit-any', ...Object.keys(tsPlugin.rules).filter(name => name.startsWith('no-unsafe-')).map(name => `@typescript-eslint/${name}`), 'stynx/no-raw-query', 'stynx/define-query-location', '@typescript-eslint/no-require-imports', 'stynx/no-authored-cjs'];
const configFile = resolve(root, mode === 'root' ? 'eslint.config.mjs' : 'tools/eslint-config/workspace-maintained.mjs');
const rows = [];
const witnesses = [];
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
      } catch (error) { row.error = { name: error.name, message: error.message }; }
    }
    rows.push(row);
  }
  for (const file of ['scripts/clean-workspace.mjs', 'scripts/lib/http-build-observer.cjs']) {
    const [result] = await eslint.lintText('const unchecked = JSON.parse("{}"); unchecked.execute();\n', { filePath: resolve(root, file) });
    witnesses.push({ file, messages: result.messages });
  }
  console.log(JSON.stringify({ mode, files, names, rows, witnesses }));
} catch (error) {
  console.log(JSON.stringify({ mode, files, error: { name: error.name, message: error.message }, rows }));
  process.exitCode = 1;
}
