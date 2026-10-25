import { BadRequestException, NotFoundException } from '@nestjs/common';
import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowFormsService } from '../../src/flow-forms.service.js';
const ID='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const now=new Date('2026-10-24T12:34:56.789Z');
function fixture(rows:Record<string,unknown>[]=[{form_id:ID}]){
 const query=vi.fn(async(sql:string,_params?:unknown[])=>({rows:sql.startsWith('select exists')?[{exists:true}]:rows}));
 const run:Transaction['run']=(q,p)=>executeTypedQuery({query},q,p);const runGuarded:Transaction['runGuarded']=(q,p,g)=>executeGuardedQueryRows({query},q,p,g);
 const tx=vi.fn(async(fn:(trx:{query:typeof query;run:typeof run;runGuarded:typeof runGuarded})=>unknown)=>fn({query,run,runGuarded}));
 const context={tenantId:'opaque-tenant',actorId:'opaque-actor' as string|null|undefined};return {query,tx,context,service:new FlowFormsService({tx} as never,context as never)};
}
const fillOptional=['runId','nodeRunId','taskId','status'] as const;
const fillOptionalColumns=['run_id','node_run_id','task_id','status'];
function select(mask:number){return fillOptional.map((_,i)=>i).filter(i=>Boolean(mask&(1<<i)));}
const optionalValue=(i:number)=>i===3?'submitted':OTHER;
describe('Forms thirty-eight original public mutation shapes',()=>{
 afterEach(()=>vi.useRealTimers());
 for(let mask=0;mask<16;mask++)it(`fill create ${mask}: exact parser, SQL and binds`,async()=>{
  const input:Record<string,unknown>={formId:OTHER,scopeId:OTHER,targetType:' entity ',targetId:' target '};const selected=select(mask);for(const i of [...selected].reverse())input[fillOptional[i]!]=optionalValue(i);
  const columns=['tenant_id','form_id','scope_id',...selected.filter(i=>i<3).map(i=>fillOptionalColumns[i]),'target_type','target_id',...(selected.includes(3)?['status']:[]),'created_by','updated_by'];
  const params=['opaque-tenant',ID,OTHER,...selected.filter(i=>i<3).map(optionalValue),'entity','target',...(selected.includes(3)?['submitted']:[]),'opaque-actor','opaque-actor'];
  const sql=`insert into flow.fills (${columns.join(', ')}) values (${columns.map((_,i)=>`$${i+1}`).join(', ')}) returning *`;
  const h=fixture();expect(await h.service.createFill(ID,input)).toEqual({formId:ID});expect(h.query).toHaveBeenCalledExactlyOnceWith(sql,params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_FORMS38_BASELINE '+JSON.stringify({op:'fillCreate',mask,sql,params}));
 });
 for(let mask=1;mask<16;mask++)it(`fill update ${mask}: exact parser, SQL and binds`,async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const selected=select(mask);const input:Record<string,unknown>={};for(const i of [...selected].reverse())input[fillOptional[i]!]=optionalValue(i);
  const columns=[...selected.map(i=>fillOptionalColumns[i]),'updated_by','updated_at'];const params=['opaque-id',...selected.map(optionalValue),'opaque-actor',now];const sql=`update flow.fills set ${columns.map((column,i)=>`${column} = $${i+2}`).join(', ')} where id = $1::uuid returning *`;
  const h=fixture();expect(await h.service.updateFill('opaque-id',input)).toEqual({formId:ID});expect(h.query).toHaveBeenCalledExactlyOnceWith(sql,params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_FORMS38_BASELINE '+JSON.stringify({op:'fillUpdate',mask,sql,params}));
 });
 for(let mask=1;mask<8;mask++)it(`answer update ${mask}: precheck, opaque binds and exact order`,async()=>{
  vi.useFakeTimers();vi.setSystemTime(now);const opaque={nested:[undefined,9n,new Date(NaN)]};const fields=['questionId','value','attachment'];const names=['question_id','value','attachment'];const values=[ID,opaque,opaque];const selected=fields.map((_,i)=>i).filter(i=>Boolean(mask&(1<<i)));const input=Object.fromEntries([...selected].reverse().map(i=>[fields[i],values[i]]));
  const columns=[...selected.map(i=>names[i]),'updated_by','updated_at'];const params=['opaque-id',...selected.map(i=>values[i]),'opaque-actor',now];const sql=`update flow.answers set ${columns.map((column,i)=>`${column} = $${i+2}`).join(', ')} where id = $1::uuid returning *`;const h=fixture();await h.service.updateAnswer('opaque-id',input);
  if(mask&1){expect(h.query).toHaveBeenCalledTimes(2);expect(h.query.mock.calls[0]).toEqual(['select exists(select 1 from flow.questions where id = $1::uuid) as exists',[ID]]);}else expect(h.query).toHaveBeenCalledTimes(1);
  expect(h.query.mock.calls.at(-1)).toEqual([sql,params]);for(const i of selected.filter(i=>i>0))expect(h.query.mock.calls.at(-1)?.[1]?.[selected.indexOf(i)+1]).toBe(opaque);
  console.log('FLOW_FORMS38_BASELINE '+JSON.stringify({op:'answerUpdate',mask,sql,columns}));
 });
 it.each(fillOptional)('retains own undefined as a selected fill update column %s',async field=>{
  vi.useFakeTimers();vi.setSystemTime(now);const h=fixture();await h.service.updateFill('id',{[field]:undefined});const column=fillOptionalColumns[fillOptional.indexOf(field)];expect(h.query).toHaveBeenCalledExactlyOnceWith(`update flow.fills set ${column} = $2, updated_by = $3, updated_at = $4 where id = $1::uuid returning *`,['id',undefined,'opaque-actor',now]);
 });
 it('retains all four own undefined optional create fields as bound columns',async()=>{
  const h=fixture();await h.service.createFill(ID,{scopeId:OTHER,targetType:'e',targetId:'t',runId:undefined,nodeRunId:undefined,taskId:undefined,status:undefined});expect(h.query.mock.calls[0]).toEqual(['insert into flow.fills (tenant_id, form_id, scope_id, run_id, node_run_id, task_id, target_type, target_id, status, created_by, updated_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *',['opaque-tenant',ID,OTHER,undefined,undefined,undefined,'e','t',undefined,'opaque-actor','opaque-actor']]);
 });
 it.each([undefined,null,Symbol('value'),3n,()=>3,[undefined],{nested:4n}])('retains opaque answer values and own undefined %s',async value=>{
  const h=fixture();await h.service.updateAnswer('id',{value,attachment:value});expect(h.query).toHaveBeenCalledTimes(1);expect(h.query.mock.calls[0]?.[1]?.[1]).toBe(value);expect(h.query.mock.calls[0]?.[1]?.[2]).toBe(value);
 });
 it('normalizes itemId alias and preserves explicit question priority and missing-question ordering',async()=>{
  const h=fixture();await h.service.updateAnswer('id',{questionId:undefined,itemId:ID,value:1});expect(h.query.mock.calls[0]?.[1]).toEqual([ID]);
  await h.service.updateAnswer('id',{questionId:OTHER,itemId:ID,value:2});expect(h.query.mock.calls[2]?.[1]).toEqual([OTHER]);
  const absent=fixture();absent.query.mockResolvedValueOnce({rows:[{exists:false}]});await expect(absent.service.updateAnswer('id',{itemId:ID})).rejects.toMatchObject({message:'Question not found'});expect(absent.query).toHaveBeenCalledTimes(1);
 });
 it('omits normalized undefined question aliases but retains value undefined',async()=>{
  const h=fixture();await h.service.updateAnswer('id',{questionId:undefined,itemId:undefined,value:undefined});expect(h.query).toHaveBeenCalledTimes(1);expect(h.query.mock.calls[0]?.[0]).toContain('set value = $2');expect(h.query.mock.calls[0]?.[1]?.[1]).toBeUndefined();
 });
 it.each(['fill','answer'])('retains empty update no SQL %s',async kind=>{
  const h=fixture();const promise=kind==='fill'?h.service.updateFill('id',{ignored:true}):h.service.updateAnswer('id',{ignored:true});await expect(promise).rejects.toMatchObject({message:'At least one update field is required'});expect(h.tx).toHaveBeenCalledTimes(1);expect(h.query).not.toHaveBeenCalled();
 });
 it('retains parser failures before tx and create-from-body wrapper requirements',()=>{
  const h=fixture();expect(()=>h.service.updateFill('id',{status:'bad'})).toThrow(BadRequestException);expect(()=>h.service.createFill(ID,{scopeId:'bad',targetType:'e',targetId:'t'})).toThrow(BadRequestException);expect(()=>h.service.createFillFromBody({})).toThrow('formId is required');expect(h.tx).not.toHaveBeenCalled();
 });
 it('retains empty create fallback and empty update NotFound',async()=>{
  const h=fixture([]);expect(await h.service.createFillFromBody({formId:ID,scopeId:OTHER,targetType:'e',targetId:'t'})).toEqual({});await expect(h.service.updateFill('id',{status:'draft'})).rejects.toBeInstanceOf(NotFoundException);await expect(h.service.updateAnswer('id',{value:1})).rejects.toBeInstanceOf(NotFoundException);
 });
 it('preserves context read order and nullable actors',async()=>{
  const h=fixture();const seen:string[]=[];Object.defineProperty(h.context,'tenantId',{get(){seen.push('tenant');return 'opaque-tenant';}});Object.defineProperty(h.context,'actorId',{get(){seen.push('actor');return undefined;}});
  await h.service.createFill(ID,{scopeId:OTHER,targetType:'e',targetId:'t'});expect(seen).toEqual(['tenant','actor']);expect(h.query.mock.calls[0]?.[1]?.slice(-2)).toEqual([null,null]);
  seen.length=0;await h.service.updateFill('id',{status:'draft'});expect(seen).toEqual(['actor']);
 });
 it('keeps first row, opaque own keys, unused rowCount and driver errors',async()=>{
  const nested={opaque:3n};const row={nested_value:nested};Object.defineProperty(row,'__proto__',{value:nested,enumerable:true});const h=fixture([row,{unused:true}]);const count=vi.fn(()=>{throw new Error('unused count');});h.query.mockResolvedValueOnce({rows:[row],get rowCount(){return count();}});const result=await h.service.updateFill('id',{status:'draft'});expect(result.nestedValue).toBe(nested);expect(result._Proto__).toBe(nested);expect(count).not.toHaveBeenCalled();
  const error=new Error('driver');h.query.mockRejectedValueOnce(error);await expect(h.service.updateAnswer('id',{value:1})).rejects.toBe(error);
 });
});
