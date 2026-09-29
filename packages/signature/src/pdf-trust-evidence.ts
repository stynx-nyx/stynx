import { createHash } from 'node:crypto';
import {
  PDFArray, PDFContext, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber,
  PDFObjectParser, PDFRawStream, PDFRef, PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { SignatureTrustError, SignatureTrustUnavailableError } from './errors';

const name=(value:string)=>PDFName.of(value);
type Evidence = {certs:Uint8Array[];ocsp:Uint8Array[];crls:Uint8Array[];vriOcsp:Uint8Array[];vriCrls:Uint8Array[]};
type XrefEntry={offset:number;generation:number;inUse:boolean};
type XrefSection={offset:number;previous?:number;trailer:PDFDict};
function failXref():never {throw new SignatureTrustError('Post-signature modification');}

function parsedObject(bytes:Uint8Array,context:PDFContext):{value:unknown;length:number} {
  try {
    const parser=PDFObjectParser.forBytes(bytes,context);
    const value=parser.parseObject();
    if (value instanceof PDFRawStream) {
      const declared=value.dict.get(name('Length'));
      if (!(declared instanceof PDFNumber) || declared.asNumber()!==value.getContentsSize()) failXref();
    }
    const length=(parser as unknown as {bytes:{offset():number}}).bytes.offset();
    if (!Number.isSafeInteger(length) || length<=0) failXref();
    return {value,length};
  } catch {return failXref();}
}

function finalXref(bytes:Uint8Array):{entries:Map<number,XrefEntry>;sections:XrefSection[]} {
  const text=Buffer.from(bytes).toString('latin1');
  const end=text.lastIndexOf('startxref');
  if (end<0) failXref();
  const offsetMatch=/^startxref\s+(\d+)\s+%%EOF\s*$/u.exec(text.slice(end));
  if (!offsetMatch) failXref();
  let offset=Number(offsetMatch[1]);
  const entries=new Map<number,XrefEntry>();
  const sections:XrefSection[]=[];
  const seen=new Set<number>();
  while (Number.isSafeInteger(offset) && offset>=0 && offset<bytes.length) {
    if (seen.has(offset)) failXref();
    if (text.slice(offset,offset+4)!=='xref') {
      throw new SignatureTrustUnavailableError('Unsupported PDF xref stream');
    }
    seen.add(offset);
    let cursor=offset+4;
    while (/\s/u.test(text[cursor]!)) cursor++;
    for (;;) {
      if (text.slice(cursor,cursor+7)==='trailer') {cursor+=7;break;}
      const header=/^(\d+)\s+(\d+)\s*/u.exec(text.slice(cursor));
      if (!header) failXref();
      const first=Number(header[1]);const count=Number(header[2]);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(count) || count>100_000) failXref();
      cursor+=header[0].length;
      for (let i=0;i<count;i++) {
        const line=/^(\d{10})\s+(\d{5})\s+([nf])\s*/u.exec(text.slice(cursor));
        if (!line) failXref();
        if (!entries.has(first+i)) entries.set(first+i,
          {offset:Number(line[1]),generation:Number(line[2]),inUse:line[3]==='n'});
        cursor+=line[0].length;
      }
    }
    const parsed=parsedObject(bytes.subarray(cursor),PDFContext.create());
    const trailer=parsed.value as PDFDict;
    const raw=text.slice(cursor,cursor+parsed.length);
    const keys=[...raw.matchAll(/\/((?:#[0-9a-fA-F]{2}|[A-Za-z0-9])+)/gu)]
      .map(match=>match[1]!.replace(/#([0-9a-fA-F]{2})/gu,(_,hex:string)=>
        String.fromCharCode(Number.parseInt(hex,16))));
    if (new Set(keys).size!==keys.length) failXref();
    if (keys.includes('XRefStm') || trailer.has(name('XRefStm'))) {
      throw new SignatureTrustUnavailableError('Unsupported PDF hybrid xref');
    }
    const declared=/^\s*startxref\s+(\d+)\s+%%EOF/u.exec(text.slice(cursor+parsed.length));
    if (!declared || Number(declared[1])!==offset) failXref();
    const previousValue=trailer.get(name('Prev'));
    if (previousValue && !(previousValue instanceof PDFNumber)) failXref();
    const previous=previousValue?.asNumber();
    sections.push({offset,trailer,...(previous===undefined?{}:{previous})});
    if (previous===undefined) return {entries,sections};
    offset=previous;
  }
  return failXref();
}

function checkFinalXref(pdf:Uint8Array,revisionEnd:number,catalogRef:PDFRef,
  context:PDFContext):SignatureTrustUnavailableError|undefined {
  const original=finalXref(pdf.slice(0,revisionEnd));
  let final:ReturnType<typeof finalXref>;
  try {final=finalXref(pdf);}
  catch (error) {
    if (error instanceof SignatureTrustUnavailableError) return error;
    throw error;
  }
  const text=Buffer.from(pdf).toString('latin1');
  const signedStart=original.sections[0]?.offset;
  const appended=final.sections.filter(section=>section.offset>=revisionEnd);
  if (!signedStart || !appended.length || appended.at(-1)!.previous!==signedStart) failXref();
  const effectiveCatalog=final.entries.get(catalogRef.objectNumber);
  if (!effectiveCatalog?.inUse || effectiveCatalog.generation!==catalogRef.generationNumber ||
      effectiveCatalog.offset<revisionEnd) failXref();
  const signedTrailer=original.sections[0]!.trailer;
  for (const section of appended) {
    for (const key of ['Root','Encrypt','Info']) {
      if (!sameObject(section.trailer.get(name(key)),signedTrailer.get(name(key)))) {
        if (section.trailer.has(name(key)) || signedTrailer.has(name(key))) failXref();
      }
    }
  }
  const intervals:Array<readonly [number,number]>=[];
  for (const [number,entry] of original.entries) {
    const current=final.entries.get(number);
    if (!current || current.inUse!==entry.inUse || current.generation!==entry.generation ||
        (entry.inUse && number!==catalogRef.objectNumber && current.offset!==entry.offset)) failXref();
  }
  for (const [number,entry] of final.entries) {
    if (entry.inUse && !original.entries.has(number) && entry.offset<revisionEnd) failXref();
    if (!entry.inUse || entry.offset<revisionEnd) continue;
    const header=new RegExp(`^${number}\\s+${entry.generation}\\s+obj\\b`,'u').exec(text.slice(entry.offset));
    if (!header) failXref();
    const parsed=parsedObject(pdf.subarray(entry.offset+header[0].length),context);
    if (parsed.value instanceof PDFRawStream &&
        parsed.value.dict.lookupMaybe(name('Type'),PDFName)?.toString()==='/XRef') failXref();
    const expected=context.lookup(PDFRef.of(number,entry.generation));
    if (!sameObject(parsed.value,expected)) failXref();
    intervals.push([entry.offset,entry.offset+header[0].length+parsed.length]);
  }
  for (const [start,end] of intervals) {
    if (intervals.some(([other])=>other!==start && other>start && other<end)) failXref();
  }
  for (const [ref] of context.enumerateIndirectObjects()) {
    const entry=final.entries.get(ref.objectNumber);
    if (!entry?.inUse || entry.generation!==ref.generationNumber) failXref();
  }
  return undefined;
}

export async function readSelectedSignatureDictionary(pdf:Uint8Array,revisionEnd:number,
  byteRange:readonly number[],cms:Uint8Array):Promise<{manifest?:string}> {
  let document:PDFDocument;
  try {document=await PDFDocument.load(pdf.slice(0,revisionEnd),{updateMetadata:false});}
  catch {throw new SignatureTrustError('Signed PDF signature dictionary invalid');}
  const found:PDFDict[]=[];
  for (const [,object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const range=object.get(name('ByteRange'));
    const contents=object.get(name('Contents'));
    if (!(range instanceof PDFArray) || !(contents instanceof PDFHexString) || range.size() !== 4) continue;
    const values=Array.from({length:4},(_,i)=>range.lookupMaybe(i,PDFNumber)?.asNumber());
    if (values.some((value,i)=>value !== byteRange[i]) ||
        !Buffer.from(contents.asBytes()).subarray(0,cms.length).equals(Buffer.from(cms))) continue;
    found.push(object);
  }
  if (found.length !== 1) throw new SignatureTrustError('Selected PDF signature dictionary missing or ambiguous');
  const selected=found[0]!;
  if (selected.lookupMaybe(name('SubFilter'),PDFName)?.toString() !== '/ETSI.CAdES.detached')
    throw new SignatureTrustError('CAdES PAdES subfilter absent');
  const binding=selected.lookupMaybe(name('STYNXManifestSHA256'),PDFString)?.decodeText();
  if (binding && !/^[0-9a-f]{64}$/u.test(binding))
    throw new SignatureTrustError('Signed manifest binding malformed');
  return binding ? {manifest:binding} : {};
}

export async function readWithdrawalSourceBinding(source:Uint8Array):Promise<string|undefined> {
  try {
    const document=await PDFDocument.load(source,{updateMetadata:false});
    const binding=document.catalog.lookupMaybe(name('STYNXWithdrawalSHA256'),PDFString)?.decodeText();
    return binding && /^[0-9a-f]{64}$/u.test(binding) ? binding : undefined;
  } catch {throw new SignatureTrustError('Withdrawal source PDF invalid');}
}

function streams(dict:PDFDict,key:string):Uint8Array[] {
  const array=dict.lookupMaybe(name(key),PDFArray);
  if (!array) return [];
  const result:Uint8Array[]=[];
  for (let i=0;i<array.size();i++) {
    const stream=array.lookupMaybe(i,PDFRawStream);
    if (!stream) throw new SignatureTrustError('DSS evidence is not a PDF stream');
    try {result.push(decodePDFRawStream(stream).decode());}
    catch {throw new SignatureTrustError('DSS evidence stream cannot be decoded');}
  }
  return result;
}

function sameObject(a:unknown,b:unknown):boolean {
  return !!a && !!b && (a as {toString():string}).toString() === (b as {toString():string}).toString();
}

function collectRefs(value:unknown,context:PDFDocument['context'],seen:Set<string>,depth=0):void {
  if (depth > 32) throw new SignatureTrustError('DSS object graph is too deep');
  if (value instanceof PDFRef) {
    const key=value.toString();
    if (seen.has(key)) return;
    seen.add(key);
    collectRefs(context.lookup(value),context,seen,depth+1);
  } else if (value instanceof PDFDict) {
    for (const [,child] of value.entries()) collectRefs(child,context,seen,depth+1);
  } else if (value instanceof PDFArray) {
    for (const child of value.asArray()) collectRefs(child,context,seen,depth+1);
  }
}

export async function readPdfTrustEvidence(pdf:Uint8Array,revisionEnd:number,cms:Uint8Array):Promise<Evidence> {
  const empty:Evidence={certs:[],ocsp:[],crls:[],vriOcsp:[],vriCrls:[]};
  if (revisionEnd === pdf.length) return empty;
  let previous:PDFDocument;let complete:PDFDocument;
  try {
    previous=await PDFDocument.load(pdf.slice(0,revisionEnd),{updateMetadata:false});
    complete=await PDFDocument.load(pdf,{updateMetadata:false});
  } catch {throw new SignatureTrustError('Post-signature modification');}
  const oldObjects=new Map(previous.context.enumerateIndirectObjects().map(([ref,obj])=>[ref.toString(),obj]));
  const allObjects=new Map(complete.context.enumerateIndirectObjects().map(([ref,obj])=>[ref.toString(),obj]));
  const oldCatalog=previous.catalog;
  const catalog=complete.catalog;
  const catalogRef=previous.context.getObjectRef(oldCatalog);
  if (!catalogRef) throw new SignatureTrustError('Post-signature modification');
  const unsupportedXref=checkFinalXref(pdf,revisionEnd,catalogRef,complete.context);
  if (!sameObject(complete.context.lookup(catalogRef),complete.catalog))
    throw new SignatureTrustError('Post-signature modification');
  if (oldCatalog.has(name('DSS')) || !catalog.has(name('DSS')) ||
      catalog.keys().length !== oldCatalog.keys().length+1)
    throw new SignatureTrustError('Post-signature modification');
  for (const [key,value] of oldCatalog.entries()) {
    if (!sameObject(value,catalog.get(key))) throw new SignatureTrustError('Post-signature modification');
  }
  const dss=catalog.lookupMaybe(name('DSS'),PDFDict);
  if (!dss) throw new SignatureTrustError('Post-signature modification');
  for (const [key,obj] of oldObjects) {
    if (key === catalogRef.toString()) continue;
    if (!sameObject(obj,allObjects.get(key))) throw new SignatureTrustError('Post-signature modification');
  }
  const reachable=new Set<string>();
  collectRefs(catalog.get(name('DSS')),complete.context,reachable);
  for (const [key,obj] of allObjects) {
    if (oldObjects.has(key) || reachable.has(key)) continue;
    if (obj instanceof PDFRawStream &&
        obj.dict.lookupMaybe(name('Type'),PDFName)?.toString() === '/ObjStm') continue;
    throw new SignatureTrustError('Post-signature modification');
  }
  const vri=dss.lookupMaybe(name('VRI'),PDFDict);
  const vriKey=createHash('sha1').update(cms).digest('hex').toUpperCase();
  const entry=vri?.lookupMaybe(name(vriKey),PDFDict);
  const globalOcsp=streams(dss,'OCSPs');
  const globalCrls=streams(dss,'CRLs');
  const evidence={
    certs:streams(dss,'Certs'),ocsp:globalOcsp,crls:globalCrls,
    vriOcsp:entry ? streams(entry,'OCSP') : globalOcsp,
    vriCrls:entry ? streams(entry,'CRL') : globalCrls,
  };
  const contains=(haystack:Uint8Array[],item:Uint8Array)=>
    haystack.some(candidate=>Buffer.from(candidate).equals(Buffer.from(item)));
  if (!evidence.certs.length ||
      evidence.vriOcsp.some(item=>!contains(evidence.ocsp,item)) ||
      evidence.vriCrls.some(item=>!contains(evidence.crls,item)))
    throw new SignatureTrustError('DSS VRI evidence is unbound');
  if (unsupportedXref) throw unsupportedXref;
  return evidence;
}
