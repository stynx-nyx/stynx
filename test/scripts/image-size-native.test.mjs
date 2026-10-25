import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {after,test} from 'node:test';
import {imageSourceRuntime} from './support/image-size-source-runtime.mjs';
const root=resolve(import.meta.dirname,'../..');
const runtime=imageSourceRuntime(root);
after(runtime.dispose);
const rows=[
  ['explicit','<svg width="3" height="4">',3,4],
  ['viewbox','<svg viewBox="0 0 3 4">',3,4],
  ['undefined','<svg viewBox="0 0 nope 4">',undefined,4],
  ['nan','<svg height="2" viewBox="0 0 nope 4">',NaN,2],
];
for(const [name,xml,width,height] of rows) {
  test(`SVG ${name} retains own dimensions through handler, main and actual file entry`,async()=>{
    const bytes=new TextEncoder().encode(xml);assert.equal(runtime.SVG.validate(bytes),true);
    const handler=runtime.SVG.calculate(bytes);assert.deepEqual(Reflect.ownKeys(handler),['height','width']);
    assert.deepEqual(handler,{height,width});
    const main=runtime.imageSize(bytes);assert.deepEqual(Reflect.ownKeys(main),['height','width','type']);assert.deepEqual(main,{height,width,type:'svg'});
    const file=join(runtime.temporary,`${name}.svg`);writeFileSync(file,xml);
    assert.deepEqual(await runtime.imageSizeFromFile(file),{height,width,type:'svg'});
  });
}
test('invalid SVG retains native handler, main and file refusal',async()=>{
  const xml='<svg width="nope" height="4">';const bytes=new TextEncoder().encode(xml);
  assert.equal(runtime.SVG.validate(bytes),true);
  for(const call of [()=>runtime.SVG.calculate(bytes),()=>runtime.imageSize(bytes)])assert.throws(call,{name:'TypeError',message:'Invalid SVG'});
  const file=join(runtime.temporary,'invalid.svg');writeFileSync(file,xml);await assert.rejects(runtime.imageSizeFromFile(file),{name:'TypeError',message:'Invalid SVG'});
});
test('non-SVG numeric GIF result remains numeric through main and file entry',async()=>{
  const bytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
  assert.deepEqual(runtime.imageSize(bytes),{height:1,width:1,type:'gif'});
  const file=join(runtime.temporary,'one.gif');writeFileSync(file,bytes);assert.deepEqual(await runtime.imageSizeFromFile(file),{height:1,width:1,type:'gif'});
});
test('installed Docusaurus transform preserves truthy dimension attributes for actual SVG files',async()=>{
  for(const [name,xml,width,height] of rows){
    const file=join(runtime.temporary,`consumer-${name}.svg`);writeFileSync(file,xml);
    const image={type:'image',url:`./consumer-${name}.svg`,alt:'actual SVG',title:null};
    const tree={type:'root',children:[{type:'paragraph',children:[image]}]};
    const transform=runtime.plugin({siteDir:runtime.temporary,staticDirs:[],onBrokenMarkdownImages:()=>{throw new Error('unexpected broken image');}});
    await transform(tree,{path:join(runtime.temporary,'page.mdx'),data:{compilerName:'server'}});
    assert.equal(image.type,'mdxJsxTextElement');assert.equal(image.name,'img');
    const dimensions=image.attributes.filter(attribute=>['width','height'].includes(attribute.name));
    assert.deepEqual(dimensions,[...(width?[{type:'mdxJsxAttribute',name:'width',value:String(width)}]:[]),...(height?[{type:'mdxJsxAttribute',name:'height',value:String(height)}]:[])]);
    assert.ok(image.attributes.some(attribute=>attribute.name==='src'));
    assert.deepEqual(image.children,[]);
  }
});

test('SVG declarations require dimension guards while direct numeric handlers remain numeric',()=>{
  assert.deepEqual(runtime.declarationDiagnostics("import { SVG } from './types/svg.js';\nimport { GIF } from './types/gif.js';\nimport { PNM } from './types/pnm.js';\nimport { JXL } from './types/jxl.js';\nimport { imageSize } from './index.js';\nimport { imageSizeFromFile } from './fromFile.js';\nimport type { ISize } from './types/interface.js';\nconst bytes = new TextEncoder().encode('<svg viewBox=\"0 0 nope 4\">');\nconst svg = SVG.calculate(bytes);\nconst width: number | undefined = svg.width;\nif (typeof width === 'number') width.toFixed();\nconst numericPeers: ISize[] = [GIF.calculate(bytes), PNM.calculate(bytes), JXL.calculate(bytes)];\nfor (const item of numericPeers) item.width.toFixed();\nconst overall = imageSize(bytes);\nif (overall.width !== undefined) overall.width.toFixed();\nconst fromFile = await imageSizeFromFile('fixture.svg');\nif (fromFile.width !== undefined) fromFile.width.toFixed();\n"),[]);
  const diagnostics=runtime.declarationDiagnostics("import { SVG } from './types/svg.js';\nimport { imageSize } from './index.js';\nimport { imageSizeFromFile } from './fromFile.js';\nconst bytes = new TextEncoder().encode('<svg viewBox=\"0 0 nope 4\">');\nconst handlerWidth: number = SVG.calculate(bytes).width;\nconst mainWidth: number = imageSize(bytes).width;\nconst fileWidth: number = (await imageSizeFromFile('fixture.svg')).width;\nvoid handlerWidth; void mainWidth; void fileWidth;\n");
  assert.deepEqual(diagnostics.map(({code,line})=>({code,line})),[{code:2322,line:5},{code:2322,line:6},{code:2322,line:7}]);
  for(const diagnostic of diagnostics)assert.match(diagnostic.message,/number \| undefined/u);
});
