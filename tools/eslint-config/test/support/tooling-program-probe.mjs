import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [root, mode] = process.argv.slice(2);
const require = createRequire(resolve(root, 'tools/eslint-config/package.json'));
const { ESLint } = require('eslint');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const directories = ['tools/eslint-config', 'packages-web/sdk/codegen', 'packages-web/sdk/scripts', 'packages/cli/engines'];
const files = directories.flatMap(directory => readdirSync(resolve(root, directory)).filter(name => name.endsWith('.mjs')).map(name => `${directory}/${name}`)).sort();
const visited = [];
const configFile = resolve(root, mode === 'root' ? 'eslint.config.mjs' : 'tools/eslint-config/workspace-tooling.mjs');
const inspectorRule = { meta: { schema: [] }, create(context) { return { Program() {
 const program = context.sourceCode.parserServices.program;
 visited.push({file:context.filename,hasProgram:!!program,belongs:!!program?.getSourceFile(context.filename),allowJs:program?.getCompilerOptions().allowJs,checkJs:program?.getCompilerOptions().checkJs});
} }; } };
try {
 const eslint = new ESLint({cwd:root,overrideConfigFile:configFile,overrideConfig:[{files:['**/*.mjs'],plugins:{inspectorTooling:{rules:{program:inspectorRule}}},rules:{'inspectorTooling/program':'error'}}]});
 const rules = {};
 const names = ['@typescript-eslint/no-explicit-any',...Object.keys(tsPlugin.rules).filter(name=>name.startsWith('no-unsafe-')).map(name=>`@typescript-eslint/${name}`)];
 for (const file of files) {
  const config = await eslint.calculateConfigForFile(resolve(root,file));
  rules[file] = Object.fromEntries(names.map(name=>[name,config?.rules?.[name]?.[0]??0]));
 }
 const results = await eslint.lintFiles(files.map(file=>resolve(root,file)));
 let witness=[];
 if (visited.some(item=>item.hasProgram)) {
  const filename=resolve(root,'tools/eslint-config/index.mjs');
  const source=readFileSync(filename,'utf8')+'\nconst inspectorUnsafeWitness = JSON.parse("{}");\ninspectorUnsafeWitness.unknownMethod();\n';
  const [negative]=await eslint.lintText(source,{filePath:filename});
  witness=negative.messages.filter(message=>message.ruleId?.startsWith('@typescript-eslint/no-unsafe-')).map(({ruleId,line})=>({ruleId,line}));
 }
 console.log(JSON.stringify({mode,files,visited:visited.slice(0,files.length),rules,witness,results:results.map(result=>({file:result.filePath,errors:result.errorCount,warnings:result.warningCount,messages:result.messages,fatal:result.messages.filter(message=>message.fatal||message.ruleId===null)}))}));
} catch(error) { console.log(JSON.stringify({mode,files,error:{name:error.name,message:error.message}}));process.exitCode=1; }
