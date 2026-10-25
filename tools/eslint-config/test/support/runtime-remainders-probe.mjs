import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [root,mode,serialized]=process.argv.slice(2);
const files=JSON.parse(serialized);
const require=createRequire(resolve(root,'tools/eslint-config/package.json'));
const {ESLint}=require('eslint');
const ts=require('typescript');
const plugin=require('@typescript-eslint/eslint-plugin');
const unsafeNames=['@typescript-eslint/no-explicit-any',...Object.keys(plugin.rules).filter(name=>name.startsWith('no-unsafe-')).map(name=>`@typescript-eslint/${name}`)];
const eslint=new ESLint({cwd:root,overrideConfigFile:resolve(root,mode==='root'?'eslint.config.mjs':'tools/eslint-config/workspace-maintained.mjs')});
const rows=[],witnesses=[];
for(const file of files){
  const filename=resolve(root,file),config=await eslint.calculateConfigForFile(filename);
  const row={file,configured:!!config};
  if(config){
    const language=config.languageOptions;
    row.sourceType=language.sourceType;row.rules=config.rules;row.globals=language.globals;
    try{
      const options={...language.parserOptions,filePath:filename,ecmaVersion:language.ecmaVersion,sourceType:language.sourceType};
      const parsed=language.parser.parseForESLint?language.parser.parseForESLint(readFileSync(filename,'utf8'),options):{ast:language.parser.parse(readFileSync(filename,'utf8'),options)};
      const program=parsed.services?.program;row.hasProgram=!!program;row.belongs=!!program?.getSourceFile(filename);
      if(program){
        const compiler=program.getCompilerOptions();row.compiler={allowJs:compiler.allowJs,checkJs:compiler.checkJs,strict:compiler.strict,types:compiler.types,lib:compiler.lib};
        if(file==='docs/site/docusaurus.config.js'){
          const resolved=ts.resolveModuleName('@docusaurus/types',filename,compiler,ts.sys).resolvedModule;
          row.docsTypes=resolved?{packageId:resolved.packageId,belongs:!!program.getSourceFile(resolved.resolvedFileName)}:null;
        }
        if(file.endsWith('.k6.mjs')){
          const checker=program.getTypeChecker(),source=program.getSourceFile(filename);
          row.globalSymbols=Object.fromEntries(['__ENV','open','__VU','__ITER','process','Buffer','window','document'].map(name=>[name,!!checker.resolveName(name,source,ts.SymbolFlags.Value,false)]));
          row.nodeOrDomDeclarations=program.getSourceFiles().filter(source=>source.isDeclarationFile&&(/\/node_modules\/@types\/node\//u.test(source.fileName)||/\/lib\.dom(?:\.iterable)?\.d\.ts$/u.test(source.fileName))).map(source=>source.fileName);
          row.k6Modules=['k6/http','k6/execution','k6/crypto','k6/encoding','k6/metrics'].map(name=>{const resolved=ts.resolveModuleName(name,filename,compiler,ts.sys).resolvedModule;return {name,packageId:resolved?.packageId,belongs:!!resolved&&!!program.getSourceFile(resolved.resolvedFileName)};});
        }
      }
    }catch(error){row.error={name:error.name,message:error.message};}
  }
  rows.push(row);
}
if(rows.every(row=>row.hasProgram&&row.belongs)){
  for(const file of ['tools/braces-safe/index.js','docs/site/docusaurus.config.js','docs/site/scripts/sync-content.mjs','scripts/performance/http-qualification.k6.mjs']){
    const [result]=await eslint.lintText('const unchecked = JSON.parse("{}"); unchecked.execute();\n',{filePath:resolve(root,file)});
    witnesses.push({kind:'unsafe',file,messages:result.messages});
  }
  for(const file of ['tools/braces-safe/index.js','tools/http-cache-semantics-safe/index.js','docs/site/docusaurus.config.js']){
    const [result]=await eslint.lintText('const path = require("node:path"); module.exports = path.join("a", "b");\n',{filePath:resolve(root,file)});
    witnesses.push({kind:'commonjs',file,messages:result.messages});
    const [dynamic]=await eslint.lintText('const name = String("node:path"); const path = require(name); module.exports = path.join("a", "b");\n',{filePath:resolve(root,file)});
    witnesses.push({kind:'dynamic-require',file,messages:dynamic.messages});
  }
}
console.log(JSON.stringify({mode,files,unsafeNames,rows,witnesses}));
