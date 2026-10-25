import { BadRequestException, NotFoundException } from '@nestjs/common';
import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowFormsService } from '../../src/flow-forms.service.js';
const ID='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const instant=new Date('2026-10-24T12:34:56.789Z');
const nested={big:7n,date:new Date(NaN)};
const opaque={nested};
const samples:Record<string,unknown>={scopeId:ID,formId:ID,questionId:OTHER,code:'code',version:'v1',title:'title',description:'description',isActive:false,meta:opaque,key:'key',label:'label',fieldType:'text',required:false,blocksSubmit:false,options:[nested],validators:opaque,visibleIf:opaque,sortOrder:0,targetType:'entity',targetId:'target',reason:'reason',waivedBy:OTHER,expiresAt:'2026-10-24T12:34:56.789Z'};
interface Family {table:string;create:string;update:string;fields:string[];columns:string[];required:string[];parent?:string;omit:string[];version?:boolean;actor:boolean;population:number}
const families:Family[]=[
 {table:'forms',create:'createForm',update:'updateForm',fields:['scopeId','code','version','title','description','isActive','meta'],columns:['scope_id','code','version','title','description','is_active','meta'],required:['scopeId','code','version','title'],omit:['scopeId'],version:true,actor:true,population:40},
 {table:'questions',create:'createQuestion',update:'updateQuestion',fields:['formId','key','label','fieldType','required','blocksSubmit','options','validators','visibleIf','sortOrder','meta'],columns:['form_id','key','label','field_type','required','blocks_submit','options','validators','visible_if','sort_order','meta'],required:['formId','key','label','fieldType'],parent:'formId',omit:['formId'],actor:true,population:1151},
 {table:'waivers',create:'createWaiver',update:'updateWaiver',fields:['scopeId','targetType','targetId','formId','questionId','reason','waivedBy','expiresAt'],columns:['scope_id','target_type','target_id','form_id','question_id','reason','waived_by','expires_at'],required:['scopeId','targetType','targetId','formId','reason'],omit:[],actor:false,population:263},
];
function invoke(service:FlowFormsService,name:string,...args:unknown[]):Promise<unknown>{const method:unknown=Reflect.get(service,name);if(typeof method!=='function')throw new Error('Missing public method '+name);return Promise.resolve(Reflect.apply(method,service,args));}
function fixture(rows:Record<string,unknown>[]=[{opaque_value:opaque}]){
 const query=vi.fn(async(_sql:string,_params?:unknown[])=>({rows}));const run:Transaction['run']=(q,p)=>executeTypedQuery({query},q,p);const runGuarded:Transaction['runGuarded']=(q,p,g)=>executeGuardedQueryRows({query},q,p,g);const trx={query,run,runGuarded};const tx=vi.fn(async(fn:(value:typeof trx)=>unknown)=>fn(trx));const context={tenantId:'opaque-tenant',actorId:'opaque-actor' as string|null|undefined};return {query,tx,context,service:new FlowFormsService({tx} as never,context as never)};
}
function expected(f:Family,op:'create'|'update',selected:string[],undefinedFields:string[]=[]){
 const fields=f.fields.filter(field=>selected.includes(field));const columns=fields.map(field=>f.columns[f.fields.indexOf(field)]!);const values=fields.map(field=>undefinedFields.includes(field)&&field!=='version'?undefined:samples[field]);
 if(op==='create'){const names=['tenant_id',...columns,...(f.actor?['created_by','updated_by']:[])];return {sql:`insert into flow.${f.table} (${names.join(', ')}) values (${names.map((_,i)=>`$${i+1}`).join(', ')}) returning *`,params:['opaque-tenant',...values,...(f.actor?['opaque-actor','opaque-actor']:[])]};}
 const names=[...columns,...(f.actor?['updated_by']:[]),'updated_at'];return {sql:`update flow.${f.table} set ${names.map((name,i)=>`${name} = $${i+2}`).join(', ')} where id = $1::uuid returning *`,params:['opaque-id',...values,...(f.actor?['opaque-actor']:[]),instant]};
}
for(const f of families)describe(`Original remaining Forms ${f.table} ${f.population} shapes`,()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(instant);});afterEach(()=>vi.useRealTimers());
 const optional=f.fields.filter(field=>!f.required.includes(field));
 for(let mask=0;mask<(1<<optional.length);mask++)it(`create mask ${mask} exact parser/SQL/binds`,async()=>{
  const selected=[...f.required,...optional.filter((_,i)=>Boolean(mask&(1<<i)))];const input=Object.fromEntries([...selected].reverse().filter(field=>field!==f.parent&&!(f.version&&field==='version')).map(field=>[field,samples[field]]));if(f.parent)input[f.parent]=OTHER;
  const h=fixture();const result=await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]));expect(Reflect.get(result as object,'opaqueValue')).toBe(opaque);const want=expected(f,'create',selected);expect(h.query).toHaveBeenCalledExactlyOnceWith(want.sql,want.params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_FORMS_REMAINING_BASELINE '+JSON.stringify({family:f.table,operation:'create',mask,sql:want.sql,columns:selected}));
 });
 const mutable=f.fields.filter(field=>!f.omit.includes(field)&&!(f.version&&field==='version'));
 for(let mask=f.version?0:1;mask<(1<<mutable.length);mask++)it(`update mask ${mask} exact parser/SQL/binds`,async()=>{
  const selected=mutable.filter((_,i)=>Boolean(mask&(1<<i)));if(f.version)selected.push('version');const input=Object.fromEntries([...selected].reverse().filter(field=>!(f.version&&field==='version')).map(field=>[field,samples[field]]));const h=fixture();const result=await invoke(h.service,f.update,'opaque-id',input);expect(Reflect.get(result as object,'opaqueValue')).toBe(opaque);const want=expected(f,'update',selected);expect(h.query).toHaveBeenCalledExactlyOnceWith(want.sql,want.params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_FORMS_REMAINING_BASELINE '+JSON.stringify({family:f.table,operation:'update',mask,sql:want.sql,columns:selected}));
 });
 it.each(f.fields.filter(field=>!f.omit.includes(field)))('retains selected own undefined update field %s',async field=>{
  const h=fixture();await invoke(h.service,f.update,'opaque-id',{[field]:undefined});const selected=[field];if(f.version&&field!=='version')selected.push('version');const want=expected(f,'update',selected,[field]);expect(h.query).toHaveBeenCalledExactlyOnceWith(want.sql,want.params);
 });
 it('retains all optional create own undefined properties',async()=>{
  const h=fixture();const selected=[...f.required,...optional];const input=Object.fromEntries(selected.filter(field=>field!==f.parent).map(field=>[field,optional.includes(field)?undefined:samples[field]]));await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]));const want=expected(f,'create',selected,optional);expect(h.query).toHaveBeenCalledExactlyOnceWith(want.sql,want.params);
 });
 it('retains empty update version/default or no-SQL error',async()=>{
  const h=fixture();if(f.version){await invoke(h.service,f.update,'opaque-id',{ignored:true});const want=expected(f,'update',['version']);expect(h.query).toHaveBeenCalledExactlyOnceWith(want.sql,want.params);}else{await expect(invoke(h.service,f.update,'opaque-id',{ignored:true})).rejects.toMatchObject({message:'At least one update field is required'});expect(h.query).not.toHaveBeenCalled();}expect(h.tx).toHaveBeenCalledTimes(1);
 });
 it('retains parser failure before transaction',()=>{
  const h=fixture();expect(()=>invoke(h.service,f.create,...(f.parent?[ID,{}]:[{}]))).toThrow(BadRequestException);expect(()=>invoke(h.service,f.update,'id',null)).toThrow(BadRequestException);expect(h.tx).not.toHaveBeenCalled();
 });
 it('retains empty create fallback, empty update error, and driver identity',async()=>{
  const input=Object.fromEntries(f.required.filter(field=>field!==f.parent).map(field=>[field,samples[field]]));const h=fixture([]);expect(await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]))).toEqual({});const patch={[mutable[0]!]:samples[mutable[0]!]};await expect(invoke(h.service,f.update,'opaque-id',patch)).rejects.toBeInstanceOf(NotFoundException);const error=new Error('driver');h.query.mockRejectedValueOnce(error);await expect(invoke(h.service,f.update,'opaque-id',patch)).rejects.toBe(error);
 });
 it('retains create tenant then actor reads even without actor SQL columns',async()=>{
  const seen:string[]=[];const h=fixture();Object.defineProperty(h.context,'tenantId',{get(){seen.push('tenant');return 'opaque-tenant';}});Object.defineProperty(h.context,'actorId',{get(){seen.push('actor');return undefined;}});const input=Object.fromEntries(f.required.filter(field=>field!==f.parent).map(field=>[field,samples[field]]));await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]));expect(seen).toEqual(['tenant','actor']);if(f.actor)expect(h.query.mock.calls[0]?.[1]?.slice(-2)).toEqual([null,null]);else expect(h.query.mock.calls[0]?.[0]).not.toContain('created_by');seen.length=0;await invoke(h.service,f.update,'id',{[mutable[0]!]:samples[mutable[0]!]});expect(seen).toEqual(f.actor?['actor']:[]);
 });
 it('retains first row opaque own keys and never reads rowCount',async()=>{
  const row={opaque_value:opaque};Object.defineProperty(row,'__proto__',{enumerable:true,value:opaque});const h=fixture([row,{unused:true}]);const count=vi.fn(()=>{throw new Error('unused');});h.query.mockResolvedValueOnce({rows:[row,{unused:true}],get rowCount(){return count();}});const result=await invoke(h.service,f.update,'id',{[mutable[0]!]:samples[mutable[0]!]});expect(Reflect.get(result as object,'opaqueValue')).toBe(opaque);expect(Reflect.get(result as object,'_Proto__')).toBe(opaque);expect(count).not.toHaveBeenCalled();
 });
});
