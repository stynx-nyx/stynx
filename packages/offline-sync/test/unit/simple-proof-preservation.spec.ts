import { instantMicroseconds } from '../../src/instant-microseconds.js';
import { stableStringify } from '../../src/transport.js';
const refuse=()=>{throw new Error('refused');};
describe('Offline native instant and stable serialization preservation',()=>{
 it.each([
  ['1970-01-01T00:00:00Z',0n],['1970-01-01T00:00:00.123456Z',123456n],
  ['1970-01-01T02:30:00.1+02:30',100000n],['1969-12-31T21:30:00.000001-02:30',1n],
  ['2000-02-29T00:00:00Z',951782400000000n],['0001-01-01T00:00:00Z',-62135596800000000n],
 ])('retains exact instant %s',(text,expected)=>expect(instantMicroseconds(text,refuse)).toBe(expected));
 it.each(['','2023-02-29T00:00:00Z','0000-01-01T00:00:00Z','2024-13-01T00:00:00Z','2024-01-01T24:00:00Z','2024-01-01T00:00:60Z','2024-01-01T00:00:00.1234567Z','2024-01-01T00:00:00+16:00','2024-01-01T00:00:00+01:60'])('retains refusal identity %s',text=>{const error=new Error('sentinel');let caught:unknown;try{instantMicroseconds(text,()=>{throw error;});}catch(e){caught=e;}expect(caught).toBe(error);});
 it('gets object values once in property order before key sorting and nested serialization',()=>{
  const events:string[]=[];const nested={get value(){events.push('nested');return 3;}};const input={get z(){events.push('z');expect(this).toBe(input);return nested;},get a(){events.push('a');return undefined;}};
  expect(stableStringify(input)).toBe('{"a":null,"z":{"value":3}}');expect(events).toEqual(['z','a','nested']);
 });
 it('preserves own-key enumeration without invoking toJSON or inherited values',()=>{
  const input=Object.create({inherited:2});Object.defineProperties(input,{b:{enumerable:true,value:1},a:{enumerable:true,value:null},hidden:{value:3},toJSON:{value:()=>{throw new Error('unreached');}}});Object.defineProperty(input,'__proto__',{enumerable:true,value:'own'});
  expect(stableStringify(input)).toBe('{"__proto__":"own","a":null,"b":1}');
 });
 it('preserves array holes, custom map receiver and unchanged join',()=>{
  const sparse=new Array(2);sparse[1]=undefined;expect(stableStringify(sparse)).toBe('[,null]');const array=[3];const map=vi.fn(function(this:unknown){expect(this).toBe(array);return ['custom'];});array.map=map;expect(stableStringify(array)).toBe('[custom]');expect(map).toHaveBeenCalledTimes(1);
 });
 it('retains native unsupported primitive and serializer errors',()=>{
  expect(stableStringify(Symbol('opaque'))).toBeUndefined();expect(stableStringify(()=>3)).toBeUndefined();expect(()=>stableStringify(3n)).toThrow(TypeError);
  const error=new Error('getter');let actual:unknown;try{stableStringify({get x(){throw error;}});}catch(e){actual=e;}expect(actual).toBe(error);
 });
});
