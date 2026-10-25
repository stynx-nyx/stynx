import { BadRequestException, NotFoundException } from '@nestjs/common';
import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowDesignService } from '../../src/flow-design.service.js';
const ID='11111111-1111-4111-8111-111111111111', OTHER='22222222-2222-4222-8222-222222222222';
const instant=new Date('2026-10-24T12:34:56.789Z');
const opaque={nested:{big:7n,date:new Date(NaN)},array:[undefined]};
const samples:Record<string,unknown>={scopeId:ID,graphId:ID,nodeId:ID,formId:OTHER,policySetId:ID,fromNodeId:ID,toNodeId:OTHER,code:'code',version:'v1',isActive:false,name:'name',description:'description',meta:opaque,nodeCode:'node',action:'act',effectKey:'effect',payload:opaque,sortOrder:0,actionRule:'rule',rule:'rule',spawn:false,ruleType:'permission',permissionKey:'permission',userId:OTHER,resolverKey:'resolver',params:opaque,required:false,gatingMode:'all_required',threshold:'0',applicability:opaque,weight:'1',statusCode:'status',capability:'capability',effect:'allow',priority:0,reasonCode:'reason',conditions:opaque};
interface Family { name:string; table:string; create:string; update:string; fields:string[]; columns:string[]; required:string[]; parent?:string; updateOmit:string[]; defaultVersion?:boolean; group:string }
const families:Family[]=[
 {name:'graphs',table:'graphs',create:'createGraph',update:'updateGraph',fields:['scopeId','code','version','isActive','name','description','meta'],columns:['scope_id','code','version','is_active','name','description','meta'],required:['scopeId','code','version'],updateOmit:['scopeId'],defaultVersion:true,group:'small142'},
 {name:'effects',table:'transition_effects',create:'createGraphTransitionEffect',update:'updateTransitionEffect',fields:['graphId','nodeCode','action','effectKey','payload','sortOrder'],columns:['graph_id','node_code','action','effect_key','payload','sort_order'],required:['graphId','effectKey'],parent:'graphId',updateOmit:['graphId'],group:'small142'},
 {name:'policySets',table:'policy_sets',create:'createPolicySet',update:'updatePolicySet',fields:['scopeId','version','isActive','name','description','meta'],columns:['scope_id','version','is_active','name','description','meta'],required:['scopeId','version'],updateOmit:['scopeId'],group:'small142'},
 {name:'edges',table:'edges',create:'createGraphEdge',update:'updateEdge',fields:['graphId','fromNodeId','toNodeId','action','rule','spawn','sortOrder','meta'],columns:['graph_id','from_node_id','to_node_id','action','rule','spawn','sort_order','meta'],required:['graphId','fromNodeId','toNodeId'],parent:'graphId',updateOmit:['graphId'],group:'linked477'},
 {name:'agents',table:'agent_rules',create:'createNodeAgentRule',update:'updateAgentRule',fields:['nodeId','ruleType','permissionKey','userId','resolverKey','params','sortOrder'],columns:['node_id','rule_type','permission_key','user_id','resolver_key','params','sort_order'],required:['nodeId','ruleType'],parent:'nodeId',updateOmit:['nodeId'],group:'linked477'},
 {name:'nodeForms',table:'node_form_rules',create:'createNodeFormRule',update:'updateNodeFormRule',fields:['nodeId','formId','required','gatingMode','threshold','applicability','weight','meta'],columns:['node_id','form_id','required','gating_mode','threshold','applicability','weight','meta'],required:['nodeId','formId'],parent:'nodeId',updateOmit:['nodeId','formId'],group:'linked477'},
 {name:'policyRules',table:'policy_rules',create:'createPolicyRule',update:'updatePolicyRule',fields:['policySetId','nodeCode','statusCode','action','capability','effect','priority','reasonCode','conditions','meta'],columns:['policy_set_id','node_code','status_code','action','capability','effect','priority','reason_code','conditions','meta'],required:['policySetId','effect'],parent:'policySetId',updateOmit:['policySetId'],group:'policy767'},
];
function invoke(service:FlowDesignService,name:string,...args:unknown[]):Promise<unknown>{const method:unknown=Reflect.get(service,name);if(typeof method!=='function')throw new Error('Missing actual public method '+name);return Promise.resolve(Reflect.apply(method,service,args));}
function fixture(rows:Record<string,unknown>[]=[{opaque_value:opaque}]){
 const query=vi.fn(async(_sql:string,_params?:unknown[])=>({rows}));const run:Transaction['run']=(q,p)=>executeTypedQuery({query},q,p);const runGuarded:Transaction['runGuarded']=(q,p,g)=>executeGuardedQueryRows({query},q,p,g);const trx={query,run,runGuarded};const tx=vi.fn(async(fn:(value:typeof trx)=>unknown)=>fn(trx));const context={tenantId:'opaque-tenant',actorId:'opaque-actor' as string|null|undefined};return {query,tx,context,service:new FlowDesignService({tx} as never,context as never)};
}
function shape(f:Family,operation:'create'|'update',selected:string[]){
 const names=f.fields.filter(field=>selected.includes(field));const columns=names.map(field=>f.columns[f.fields.indexOf(field)]!);const values=names.map(field=>samples[field]);
 if(operation==='create'){const all=['tenant_id',...columns,'created_by','updated_by'];return {sql:`insert into flow.${f.table} (${all.join(', ')}) values (${all.map((_,i)=>`$${i+1}`).join(', ')}) returning *`,params:['opaque-tenant',...values,'opaque-actor','opaque-actor']};}
 const all=[...columns,'updated_by','updated_at'];return {sql:`update flow.${f.table} set ${all.map((column,i)=>`${column} = $${i+2}`).join(', ')} where id = $1::uuid returning *`,params:['opaque-id',...values,'opaque-actor',instant]};
}
for(const f of families)describe(`${f.group} original ${f.name} public mutations`,()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(instant);});afterEach(()=>vi.useRealTimers());
 const optional=f.fields.filter(field=>!f.required.includes(field));
 for(let mask=0;mask<(1<<optional.length);mask++)it(`create mask ${mask} exact SQL, params and opaque result`,async()=>{
  const selected=[...f.required,...optional.filter((_,i)=>Boolean(mask&(1<<i)))];const input=Object.fromEntries([...selected].reverse().filter(field=>field!==f.parent&&!(f.defaultVersion&&field==='version')).map(field=>[field,samples[field]]));if(f.parent)input[f.parent]=OTHER;
  const h=fixture();const result=await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]));expect(result).toMatchObject({opaqueValue:opaque});expect(Reflect.get(result as object,'opaqueValue')).toBe(opaque);
  const expected=shape(f,'create',selected);expect(h.query).toHaveBeenCalledExactlyOnceWith(expected.sql,expected.params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_DESIGN_REMAINING_BASELINE '+JSON.stringify({group:f.group,family:f.name,operation:'create',mask,sql:expected.sql,columns:selected}));
 });
 const mutable=f.fields.filter(field=>!f.updateOmit.includes(field)&&!(f.defaultVersion&&field==='version'));
 for(let mask=f.defaultVersion?0:1;mask<(1<<mutable.length);mask++)it(`update mask ${mask} exact SQL, params and opaque result`,async()=>{
  const selected=mutable.filter((_,i)=>Boolean(mask&(1<<i)));if(f.defaultVersion)selected.push('version');const input=Object.fromEntries([...selected].reverse().filter(field=>!(f.defaultVersion&&field==='version')).map(field=>[field,samples[field]]));const h=fixture();const result=await invoke(h.service,f.update,'opaque-id',input);expect(result).toMatchObject({opaqueValue:opaque});const expected=shape(f,'update',selected);expect(h.query).toHaveBeenCalledExactlyOnceWith(expected.sql,expected.params);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function));console.log('FLOW_DESIGN_REMAINING_BASELINE '+JSON.stringify({group:f.group,family:f.name,operation:'update',mask,sql:expected.sql,columns:selected}));
 });
 it('retains empty or undefined-only update default/error and strips unrelated fields',async()=>{
  const h=fixture();const input=Object.fromEntries([...f.fields.map(field=>[field,undefined]),['unrelated','ignored']]);
  if(f.defaultVersion){await invoke(h.service,f.update,'opaque-id',input);const expected=shape(f,'update',['version']);expect(h.query).toHaveBeenCalledExactlyOnceWith(expected.sql,expected.params);}else{await expect(invoke(h.service,f.update,'opaque-id',input)).rejects.toMatchObject({message:'At least one update field is required'});expect(h.query).not.toHaveBeenCalled();}
 });
 it('retains missing create fields, null malformed input and no transaction',()=>{
  const h=fixture();expect(()=>invoke(h.service,f.create,...(f.parent?[ID,{}]:[{}]))).toThrow(BadRequestException);expect(()=>invoke(h.service,f.update,'id',null)).toThrow(BadRequestException);expect(h.tx).not.toHaveBeenCalled();
 });
 it('retains empty first-row errors and exact driver identity',async()=>{
  const h=fixture([]);const input=Object.fromEntries(f.required.filter(field=>field!==f.parent).map(field=>[field,samples[field]]));await expect(invoke(h.service,f.create,...(f.parent?[ID,input]:[input]))).rejects.toMatchObject({message:'Flow insert did not return a row'});
  const patch={ [mutable[0]!]:samples[mutable[0]!] };await expect(invoke(h.service,f.update,'id',patch)).rejects.toBeInstanceOf(NotFoundException);const error=new Error('driver');h.query.mockRejectedValueOnce(error);await expect(invoke(h.service,f.update,'id',patch)).rejects.toBe(error);
 });
 it('retains nullish actor, property order, first row and unused metadata',async()=>{
  const row={opaque_value:opaque};Object.defineProperty(row,'__proto__',{enumerable:true,value:opaque});const h=fixture([row,{unused:true}]);h.context.actorId=undefined;const count=vi.fn(()=>{throw new Error('unused');});h.query.mockResolvedValueOnce({rows:[row,{unused:true}],get rowCount(){return count();}});
  const input=Object.fromEntries(f.required.filter(field=>field!==f.parent).map(field=>[field,samples[field]]));const result=await invoke(h.service,f.create,...(f.parent?[ID,input]:[input]));expect(result).toMatchObject({opaqueValue:opaque,_Proto__:opaque});expect(h.query.mock.calls[0]?.[1]?.slice(-2)).toEqual([null,null]);expect(count).not.toHaveBeenCalled();
 });
});
for(const name of ['agents','nodeForms']){
 const f=families.find(x=>x.name===name)!;const optional=f.fields.filter(field=>!f.required.includes(field));
 describe(`linked477 original import missing nodeId ${name}`,()=>{
  for(let mask=0;mask<(1<<optional.length);mask++)it(`retains omission mask ${mask} and native driver error after graph and node writes`,async()=>{
   const selected=[...f.required.filter(field=>field!=='nodeId'),...optional.filter((_,i)=>Boolean(mask&(1<<i)))];const rule={nodeCode:'missing',...Object.fromEntries(selected.map(field=>[field,samples[field]]))};const h=fixture();h.context.tenantId=ID;h.context.actorId=OTHER;const stop=new Error('target database refusal');
   h.query.mockImplementation(async(sql)=>{if(sql.startsWith(`insert into flow.${f.table} `))throw stop;return {rows:[sql.startsWith('insert into flow.nodes ')?{id:ID,tenant_id:ID,graph_id:ID,code:'existing',name:null,kind:'start',decision_policy:'any',quorum_ratio:null,allowed_actions:[],sla_seconds:null,entry_rule:null,exit_rule:null,sort_order:0,meta:{},created_by:OTHER,updated_by:OTHER,created_at:instant,updated_at:instant}:{id:ID}]};});
   const document={graph:{scopeId:ID,code:'graph'},nodes:[{code:'existing',kind:'start'}],[name==='agents'?'agentRules':'nodeFormRules']:[rule]};await expect(h.service.importGraph(document)).rejects.toBe(stop);
   const expected=shape(f,'create',selected);expected.params[0]=ID;expected.params[expected.params.length-2]=OTHER;expected.params[expected.params.length-1]=OTHER;expect(h.query.mock.calls.at(-1)).toEqual([expected.sql,expected.params]);expect(h.query).toHaveBeenCalledTimes(3);console.log('FLOW_DESIGN_REMAINING_BASELINE '+JSON.stringify({group:'linked477',family:f.name,operation:'importMissingNode',mask,sql:expected.sql,columns:selected}));
  });
 });
}
describe('Original mutation aliases and defaults',()=>{
 it.each([['any_answered','any'],['score_threshold','threshold']])('normalizes node form %s without other field changes',async(input,expected)=>{const h=fixture();await h.service.updateNodeFormRule('id',{gatingMode:input});expect(h.query.mock.calls[0]?.[1]?.[1]).toBe(expected);});
 it('retains explicit graph version and trims original text',async()=>{const h=fixture();await h.service.updateGraph('id',{code:' code ',version:' v7 '});expect(h.query.mock.calls[0]?.[1]?.slice(0,3)).toEqual(['id','code','v7']);});
});
