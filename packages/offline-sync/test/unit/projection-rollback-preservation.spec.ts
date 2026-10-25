import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
interface Frame { tenantId:string; active:boolean; children:Set<Frame>; changes:Array<{order:number;version?:object;undo:()=>void}>; claims:Set<unknown>; releases:Array<()=>void>; parent?:Frame }
function invoke(owner: object, name: string, ...args: unknown[]): unknown {const fn:unknown=Reflect.get(owner,name);if(typeof fn!=='function')throw new Error(`Missing ${name}`);return Reflect.apply(fn,owner,args);}
function newFrame(parent?:Frame):Frame {return {tenantId:'tenant',active:true,children:new Set(),changes:[],claims:new Set(),releases:[],...(parent?{parent}:{})};}
function fixture() {
 const store=new InMemoryOfflineSyncStore();const raw:unknown=Reflect.get(store,'queueItems');if(!(raw instanceof Map))throw new Error('Missing real queue map');const map:Map<string,unknown>=raw;
 const context:unknown=Reflect.get(store,'mutationContext');if(typeof context!=='object'||context===null)throw new Error('Missing context');
 const frame=newFrame();const run=(owner:Frame,key:string,value:unknown)=>invoke(context,'run',owner,()=>invoke(store,'writeProjection',map,key,value));
 return {store,map,frame,run,undo:()=>invoke(store,'rollbackFrame',frame)};
}
function caught(fn:()=>unknown):unknown {try{fn();return undefined;}catch(e){return e;}}
describe('Memory projection closed string-key rollback preservation',()=>{
 it.each(['absent','present-undefined','present-object'])('captures has then get exactly once and restores %s',kind=>{
  const h=fixture();const old={old:true};if(kind!=='absent')h.map.set('key',kind==='present-object'?old:undefined);
  const events:string[]=[];const nativeHas=h.map.has,nativeGet=h.map.get;
  h.map.has=function(key){expect(this).toBe(h.map);events.push('has:'+key);return nativeHas.call(this,key);};
  h.map.get=function(key){expect(this).toBe(h.map);events.push('get:'+key);return nativeGet.call(this,key);};
  const next={next:true};expect(h.run(h.frame,'key',next)).toBe(h.map);expect(events).toEqual(['has:key','get:key']);
  h.undo();expect(events).toEqual(['has:key','get:key']);expect(nativeHas.call(h.map,'key')).toBe(kind!=='absent');expect(nativeGet.call(h.map,'key')).toBe(kind==='present-object'?old:undefined);
 });
 it.each(['has','get'])('preserves initial %s failure identity and prevents writes',method=>{
  const h=fixture();const error=new Error(method);const set=vi.spyOn(h.map,'set');Object.defineProperty(h.map,method,{value(){expect(this).toBe(h.map);throw error;}});
  expect(caught(()=>h.run(h.frame,'key',{next:true}))).toBe(error);expect(set).not.toHaveBeenCalled();expect(h.frame.changes).toEqual([]);
 });
 it.each(['absent','present'])('looks up the latest restore method lazily for %s',kind=>{
  const h=fixture();const prior={prior:true};if(kind==='present')h.map.set('key',prior);h.run(h.frame,'key',{next:true});
  const events:unknown[]=[];const name=kind==='present'?'set':'delete';const native=name==='set'?Map.prototype.set:Map.prototype.delete;
  Object.defineProperty(h.map,name,{configurable:true,get(){events.push('lookup');expect(this).toBe(h.map);return function(this:Map<string,unknown>,...args:unknown[]){expect(this).toBe(h.map);events.push(args);return Reflect.apply(native,this,args);};}});
  expect(events).toEqual([]);h.undo();expect(events).toEqual(['lookup',kind==='present'?['key',prior]:['key']]);expect(Map.prototype.has.call(h.map,'key')).toBe(kind==='present');
 });
 it.each(['absent','present'])('does not advance version after restore failure for %s',kind=>{
  const h=fixture();if(kind==='present')h.map.set('key',{prior:true});h.run(h.frame,'key',{next:true});const undo=h.frame.changes[0]!.undo;const error=new Error('restore');const name=kind==='present'?'set':'delete';
  Object.defineProperty(h.map,name,{configurable:true,get(){throw error;}});expect(caught(undo)).toBe(error);
  const restored=vi.fn(function(this:Map<string,unknown>,...args:unknown[]){expect(this).toBe(h.map);return Reflect.apply(name==='set'?Map.prototype.set:Map.prototype.delete,this,args);});
  Object.defineProperty(h.map,name,{configurable:true,value:restored});undo();expect(restored).toHaveBeenCalledTimes(1);undo();expect(restored).toHaveBeenCalledTimes(1);
 });
 it('ignores superseded versions and restores original object after complete reverse rollback',()=>{
  const h=fixture();const initial={initial:true};h.map.set('key',initial);h.run(h.frame,'key',{one:true});const first=h.frame.changes[0]!.undo;const latest={two:true};h.run(h.frame,'key',latest);
  first();expect(h.map.get('key')).toBe(latest);h.undo();expect(h.map.get('key')).toBe(initial);
 });
 it('restores interleaved keys in descending journal order',()=>{
  const h=fixture();h.run(h.frame,'one',1);h.run(h.frame,'two',2);h.run(h.frame,'one',3);const events:string[]=[];
  const del=h.map.delete;h.map.delete=function(key){events.push(key);return del.call(this,key);};h.undo();expect(events).toEqual(['one','two']);expect(h.map.size).toBe(0);
 });
 it('retains child rollback then parent rollback and identity',()=>{
  const h=fixture();const initial={initial:true};h.map.set('key',initial);const parentValue={parent:true};h.run(h.frame,'key',parentValue);const child=newFrame(h.frame);h.frame.children.add(child);h.run(child,'key',{child:true});
  invoke(h.store,'rollbackFrame',child);expect(h.map.get('key')).toBe(parentValue);h.frame.children.delete(child);h.undo();expect(h.map.get('key')).toBe(initial);
 });
 it('marks every descendant before walking rolled-back ancestry',()=>{
  const h=fixture();const initial={initial:true};h.map.set('key',initial);h.run(h.frame,'key',{parent:true});const child=newFrame(h.frame);h.frame.children.add(child);h.run(child,'key',{child:true});
  const restored:unknown[]=[];const set=h.map.set;h.map.set=function(key,value){restored.push(value);return set.call(this,key,value);};h.undo();expect(restored).toEqual([initial]);expect(h.map.get('key')).toBe(initial);expect(child.active).toBe(false);
 });
 it('refuses a competing sibling claim without modifying its existing owner',()=>{
  const h=fixture();const owner={owned:true};h.run(h.frame,'key',owner);const sibling=newFrame();const error=caught(()=>h.run(sibling,'key',{other:true}));expect(error).toMatchObject({code:'OFFLINE_SYNC_CONFLICT_STATE'});expect(h.map.get('key')).toBe(owner);expect(sibling.changes).toEqual([]);
 });
});
