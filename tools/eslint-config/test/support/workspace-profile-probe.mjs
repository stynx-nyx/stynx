import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [root, directory, relativeFile, mode, profile] = process.argv.slice(2);
const require = createRequire(resolve(root, 'tools/eslint-config/package.json'));
const { ESLint } = require('eslint');
const packageDir = resolve(root, directory);
const cwd = mode === 'root' ? root : packageDir;
process.chdir(cwd);
process.env.npm_package_name = mode === 'package' ? JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')).name : 'inspector-poison';
const configFile = mode === 'root' ? resolve(root, 'eslint.config.mjs') : profile === 'local' ? resolve(packageDir, 'eslint.config.mjs') : resolve(root, `tools/eslint-config/${profile}.mjs`);
const visited=[];
const probeRule = {
 meta: { schema: [] },
 create(context) {
  return { Program() {
   const program = context.sourceCode.parserServices.program;
   visited.push({ filename: context.filename, hasProgram: !!program, belongs: !!program?.getSourceFile(context.filename) });
  } };
 }
};
const eslint = new ESLint({ cwd, overrideConfigFile: configFile, overrideConfig: [{
 files: ['**/*.ts'], plugins: { inspectorProgram: { rules: { capture: probeRule } } },
 rules: { 'inspectorProgram/capture': 'error' }
}] });
const filename=resolve(packageDir,relativeFile);
try {
 const config=await eslint.calculateConfigForFile(filename);
 const typedProject=!!(config?.languageOptions.parserOptions.project || config?.languageOptions.parserOptions.programs || config?.languageOptions.parserOptions.projectService);
 const results=process.env.STYNX_INSPECTOR_CONFIG_ONLY === '1' || !typedProject ? [] : await eslint.lintFiles([filename]);
 const selectedRules=Object.fromEntries(Object.entries(config?.rules??{}).filter(([name])=>name.startsWith('@typescript-eslint/no-unsafe-')||name.startsWith('@angular-eslint/')||name.startsWith('@angular-eslint/template/')||name==='stynx/require-package-index-tsdoc'||['@typescript-eslint/no-explicit-any','stynx/no-raw-query','stynx/no-pg-pool-in-infra','stynx/no-s3-fetch','no-restricted-imports','jsdoc/require-jsdoc'].includes(name)));
 const ignored={};for(const f of ['dist/inspector.ts','build/inspector.ts','node_modules/inspector.ts','src/generated/inspector.ts'])ignored[f]=await eslint.isPathIgnored(resolve(packageDir,f));
 const initialVisited = [...visited];
 let witness = [];
 const kind = process.env.STYNX_INSPECTOR_WITNESS;
 if (kind) {
  const original = readFileSync(filename, 'utf8');
  const source = kind === 'unsafe' ? original + '\nconst inspectorUnsafeWitness: any = undefined;\n' : original.replace(/template: `[\s\S]*?`/u, 'template: `<div>{{ 1 == 2 }}</div>`');
  if(source === original) throw new Error('Template witness did not change source');
  const [negative] = await eslint.lintText(source, {filePath: filename});
  witness = negative.messages.filter(message => kind === 'unsafe' ? message.ruleId === '@typescript-eslint/no-explicit-any' : message.ruleId?.startsWith('@angular-eslint/template/')).map(({ruleId,severity,message})=>({ruleId,severity,message}));
 }
 const processor=config?.processor; const blocks=typeof processor?.preprocess==='function' ? processor.preprocess(readFileSync(filename,'utf8'),filename).map(block=>typeof block==='string'?{text:block}:{filename:block.filename,text:block.text}) : null;
 console.log(JSON.stringify({root,directory,relativeFile,mode,profile,configFile,typedProject,visited:initialVisited,witness,rules:selectedRules,processor:processor ? {hasPreprocess:typeof processor.preprocess==='function',meta:processor.meta,blocks} : null,ignored,results:results.map(r=>({filePath:r.filePath,errorCount:r.errorCount,warningCount:r.warningCount,fatal:r.messages.filter(m=>m.fatal||m.ruleId===null)}))}));
} catch(error){console.log(JSON.stringify({directory,relativeFile,mode,profile,error:{name:error.name,message:error.message}}));process.exitCode=1;}
