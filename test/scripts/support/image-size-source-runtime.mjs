import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import ts from 'typescript';

export function imageSourceRuntime(root) {
  const temporary=mkdtempSync(join(tmpdir(),'stynx-image-source-'));
  const configPath=join(root,'tools/image-size-safe/tsconfig.json');
  const loaded=ts.readConfigFile(configPath,ts.sys.readFile);
  assert.equal(loaded.error,undefined);
  const parsed=ts.parseJsonConfigFileContent(loaded.config,ts.sys,dirname(configPath),undefined,configPath);
  assert.deepEqual(parsed.errors,[]);
  const program=ts.createProgram(parsed.fileNames,parsed.options);
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
  const result=program.emit(undefined,(name,text)=>{
    const path=relative(resolve(parsed.options.outDir),name);
    assert.equal(path.startsWith('..'),false);
    const destination=join(temporary,path);mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,text);
  });
  assert.equal(result.emitSkipped,false);assert.deepEqual(result.diagnostics,[]);
  const require=createRequire(join(root,'package.json'));
  const {SVG}=require(join(temporary,'types/svg.js'));
  const {imageSize}=require(join(temporary,'index.js'));
  const {imageSizeFromFile}=require(join(temporary,'fromFile.js'));
  const docsRequire=createRequire(join(root,'docs/site/package.json'));
  const coreManifest=docsRequire.resolve('@docusaurus/core/package.json');
  const mdxManifest=createRequire(coreManifest).resolve('@docusaurus/mdx-loader/package.json');
  const transformPath=join(dirname(mdxManifest),'lib/remark/transformImage/index.js');
  let redirects=0;
  const hook=registerHooks({resolve(specifier,context,next){
    if(specifier==='image-size/fromFile'&&context.parentURL===pathToFileURL(transformPath).href){redirects++;return {url:pathToFileURL(join(temporary,'fromFile.js')).href,shortCircuit:true};}
    return next(specifier,context);
  }});
  let plugin;
  try {plugin=createRequire(mdxManifest)(transformPath).default;} finally {hook.deregister();}
  assert.equal(redirects,1,'actual installed transform must consume genuine current source emit');
  let consumerId=0;
  function declarationDiagnostics(source) {
    const file=join(temporary,`consumer-${consumerId++}.mts`);writeFileSync(file,source);
    const consumer=ts.createProgram([file],{strict:true,noEmit:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,types:[],skipLibCheck:false});
    return ts.getPreEmitDiagnostics(consumer).map(d=>({file:d.file?relative(temporary,d.file.fileName):null,line:d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start).line+1:null,code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')}));
  }
  return {temporary,SVG,imageSize,imageSizeFromFile,plugin,declarationDiagnostics,dispose:()=>rmSync(temporary,{recursive:true,force:true})};
}
