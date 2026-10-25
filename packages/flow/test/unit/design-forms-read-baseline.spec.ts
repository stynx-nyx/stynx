import { executeGuardedQueryRows, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { FlowDesignService } from '../../src/flow-design.service.js';
import { FlowFormsService } from '../../src/flow-forms.service.js';
import { NotFoundException } from '@nestjs/common';
const ID = '0190abcd-1234-7abc-89ab-000000000001';
function fixture(rows: Record<string,unknown>[] = []) {
  const query = vi.fn(async (_text:string,_values?:unknown[]) => ({rows}));
  const run:Transaction['run']=(statement,params)=>executeTypedQuery({query},statement,params);
  const runGuarded:Transaction['runGuarded']=(statement,params,guard)=>executeGuardedQueryRows({query},statement,params,guard);
  const trx={query,run,runGuarded};const tx=vi.fn(async(fn:(value:typeof trx)=>unknown,_opts?:unknown)=>fn(trx));
  return {query,tx,design:new FlowDesignService({tx} as never,{} as never),forms:new FlowFormsService({tx} as never,{} as never)};
}
const designLists = [
  {name:'scopes',table:'scopes',column:undefined,order:'created_at DESC',invoke:(s:FlowDesignService)=>s.listScopes()},
  {name:'graphs-empty',table:'graphs',column:undefined,order:'created_at DESC',invoke:(s:FlowDesignService)=>s.listGraphs()},
  {name:'graphs-scope',table:'graphs',column:'scope_id',order:'created_at DESC',invoke:(s:FlowDesignService)=>s.listGraphs(ID)},
  {name:'nodes',table:'nodes',column:'graph_id',order:'sort_order, code',invoke:(s:FlowDesignService)=>s.listGraphNodes(ID)},
  {name:'edges',table:'edges',column:'graph_id',order:'sort_order, action NULLS FIRST',invoke:(s:FlowDesignService)=>s.listGraphEdges(ID)},
  {name:'agents',table:'agent_rules',column:'node_id',order:'sort_order, id',invoke:(s:FlowDesignService)=>s.listNodeAgentRules(ID)},
  {name:'effects',table:'transition_effects',column:'graph_id',order:'sort_order, id',invoke:(s:FlowDesignService)=>s.listGraphTransitionEffects(ID)},
  {name:'nodeforms',table:'node_form_rules',column:'node_id',order:'id',invoke:(s:FlowDesignService)=>s.listNodeFormRules(ID)},
  {name:'policy-empty',table:'policy_sets',column:undefined,order:'version, id',invoke:(s:FlowDesignService)=>s.listPolicySets()},
  {name:'policy-scope',table:'policy_sets',column:'scope_id',order:'version, id',invoke:(s:FlowDesignService)=>s.listPolicySets(ID)},
  {name:'rules',table:'policy_rules',column:'policy_set_id',order:'priority, id',invoke:(s:FlowDesignService)=>s.listPolicyRules(ID)},
] as const;
const designGets = [
  {table:'scopes',invoke:(s:FlowDesignService)=>s.getScope(ID)},
  {table:'graphs',invoke:(s:FlowDesignService)=>s.getGraph(ID)},
  {table:'nodes',invoke:(s:FlowDesignService)=>s.getNode(ID)},
  {table:'edges',invoke:(s:FlowDesignService)=>s.getEdge(ID)},
  {table:'agent_rules',invoke:(s:FlowDesignService)=>s.getAgentRule(ID)},
  {table:'transition_effects',invoke:(s:FlowDesignService)=>s.getTransitionEffect(ID)},
  {table:'node_form_rules',invoke:(s:FlowDesignService)=>s.getNodeFormRule(ID)},
  {table:'policy_sets',invoke:(s:FlowDesignService)=>s.getPolicySet(ID)},
  {table:'policy_rules',invoke:(s:FlowDesignService)=>s.getPolicyRule(ID)},
] as const;
const opaque = () => {
  const nested={date:new Date(NaN),big:4n,absent:undefined};const array=[nested];const proto={retained:true};
  const row={nested_value:nested,array_value:array};Object.defineProperty(row,'__proto__',{enumerable:true,value:proto});
  return {row,nested,array,proto};
};
function assertOpaque(row:unknown, expected:ReturnType<typeof opaque>) {
  if(typeof row!=='object'||row===null) throw new Error('Expected mapped record');
  expect(Reflect.get(row,'nestedValue')).toBe(expected.nested);expect(Reflect.get(row,'arrayValue')).toBe(expected.array);
  expect(Object.hasOwn(row,'_Proto__')).toBe(true);expect(Reflect.get(row,'_Proto__')).toBe(expected.proto);
}
describe('Design twenty fixed read shapes before conversion',()=>{
  for(const shape of designLists){
    it(`captures exact list ${shape.name} SQL, opaque values and readonly context`,async()=>{
      const value=opaque();const h=fixture([value.row]);const result=await shape.invoke(h.design);
      const sql=`select * from flow.${shape.table}${shape.column?` where ${shape.column} = $1::uuid`:''} order by ${shape.order}`;
      expect(h.query).toHaveBeenCalledExactlyOnceWith(sql,shape.column?[ID]:[]);
      expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function),{role:'reader',readonly:true});
      expect(result).toHaveLength(1);assertOpaque(result[0],value);
      if(shape.table==='graphs')expect(result[0]?.status).toBe('draft');
      console.log('FLOW_DESIGN20_BASELINE '+JSON.stringify({shape:shape.name,kind:'list',calls:h.query.mock.calls}));
    });
    it(`retains empty list and driver error ${shape.name}`,async()=>{
      const h=fixture();expect(await shape.invoke(h.design)).toEqual([]);const error=new Error('original driver');h.query.mockRejectedValueOnce(error);
      await expect(shape.invoke(h.design)).rejects.toBe(error);expect(h.query).toHaveBeenCalledTimes(2);
    });
  }
  for(const shape of designGets){
    it(`captures exact get ${shape.table} and first row opaque values`,async()=>{
      const value=opaque();const h=fixture([value.row,{later:true}]);const result=await shape.invoke(h.design);
      expect(h.query).toHaveBeenCalledExactlyOnceWith(`select * from flow.${shape.table} where id = $1::uuid limit 1`,[ID]);
      expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function),{role:'reader',readonly:true});assertOpaque(result,value);
      if(shape.table==='graphs')expect(result.status).toBe('draft');
      console.log('FLOW_DESIGN20_BASELINE '+JSON.stringify({shape:shape.table,kind:'get',calls:h.query.mock.calls}));
    });
    it(`retains empty NotFound and driver identity ${shape.table}`,async()=>{
      const h=fixture();const error=await shape.invoke(h.design).catch((caught:unknown)=>caught);expect(error).toBeInstanceOf(NotFoundException);expect(error).toMatchObject({message:'Flow row not found'});
      const driver=new Error('driver');h.query.mockRejectedValueOnce(driver);await expect(shape.invoke(h.design)).rejects.toBe(driver);expect(h.query).toHaveBeenCalledTimes(2);
    });
  }
  it('retains graph publication projection and original meta identity',async()=>{
    const meta={publish:{publishedVersion:3,publishedAt:'opaque time',publishedBy:'actor'},opaque:[4n]};
    const h=fixture([{meta,untouched_key:'value'}]);expect(await h.design.getGraph(ID)).toEqual({meta,untouchedKey:'value',status:'published',publishedVersion:3,publishedAt:'opaque time',publishedBy:'actor'});
    expect((await h.design.listGraphs())[0]?.meta).toBe(meta);
  });
  it.each(['',' ',' %_ '])('preserves exact optional scope truthiness %s',async(value)=>{
    const h=fixture();await h.design.listGraphs(value);await h.design.listPolicySets(value);
    expect(h.query.mock.calls).toEqual([
      [`select * from flow.graphs${value?' where scope_id = $1::uuid':''} order by created_at DESC`,value?[value]:[]],
      [`select * from flow.policy_sets${value?' where scope_id = $1::uuid':''} order by version, id`,value?[value]:[]],
    ]);
  });
});
const formFamilies=[
  {name:'fills',method:'listFills',fields:['formId','scopeId','runId','taskId','targetId','targetType'],columns:['form_id','scope_id','run_id','task_id','target_id','target_type'],uuidCount:4},
  {name:'waivers',method:'listWaivers',fields:['scopeId','formId','questionId','targetId','targetType'],columns:['scope_id','form_id','question_id','target_id','target_type'],uuidCount:3},
] as const;
describe('Forms one hundred list shapes before conversion',()=>{
  for(const family of formFamilies){
    for(let mask=0;mask<1<<family.fields.length;mask++){
      it(`captures ${family.name} mask ${mask} SQL, binds and opaque rows`,async()=>{
        const input:Record<string,unknown>={};const values:string[]=[];const clauses:string[]=[];
        family.fields.forEach((field,bit)=>{if(mask&(1<<bit)){const value=bit<family.uuidCount?ID:'opaque %_';input[field]=value;values.push(value);clauses.push(`${family.columns[bit]} = $${values.length}${bit<family.uuidCount?'::uuid':''}`);}});
        const value=opaque();const h=fixture([value.row]);const result=await h.forms[family.method](input);
        const sql=`select * from flow.${family.name}${clauses.length?' where '+clauses.join(' and '):''} order by created_at desc`;
        expect(h.query).toHaveBeenCalledExactlyOnceWith(sql,values);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function),{role:'reader',readonly:true});expect(result).toHaveLength(1);assertOpaque(result[0],value);
        console.log('FLOW_FORMS100_BASELINE '+JSON.stringify({family:family.name,mask,calls:h.query.mock.calls}));
      });
    }
    it.each([undefined,null,'',false,0,[],{}])(`${family.name} omits unsupported or empty filters %s`,async(value)=>{
      const h=fixture();await h.forms[family.method](Object.fromEntries(family.fields.map(field=>[field,value])));
      expect(h.query).toHaveBeenCalledExactlyOnceWith(`select * from flow.${family.name} order by created_at desc`,[]);
    });
    it(`${family.name} preserves exact getter order once, including absent filters`,async()=>{
      const reads:string[]=[];const h=fixture();const input={};
      for(const field of family.fields)Object.defineProperty(input,field,{get(){reads.push(field);return '';}});
      h.tx.mockImplementationOnce(async fn=>{reads.push('tx');return fn({query:h.query,run:(q,p)=>executeTypedQuery({query:h.query},q,p),runGuarded:(q,p,g)=>executeGuardedQueryRows({query:h.query},q,p,g)});});
      await h.forms[family.method](input);expect(reads).toEqual([...family.fields,'tx']);
    });
    it(`${family.name} keeps whitespace and wildcard text without trimming`,async()=>{
      const h=fixture();await h.forms[family.method](Object.fromEntries(family.fields.map(field=>[field,' %_ '])));
      expect(h.query.mock.calls[0]?.[1]).toEqual(family.fields.map(()=>' %_ '));
    });
    it(`${family.name} preserves driver identity and input getter refusal before transaction`,async()=>{
      const error=new Error('driver');const h=fixture();h.query.mockRejectedValueOnce(error);await expect(h.forms[family.method]()).rejects.toBe(error);
      const other=fixture();const input=Object.defineProperty({},family.fields[0],{get(){throw error;}});expect(()=>other.forms[family.method](input)).toThrow(error);expect(other.tx).not.toHaveBeenCalled();expect(other.query).not.toHaveBeenCalled();
    });
  }
  const fixed=[
    {name:'forms-empty',invoke:(s:FlowFormsService)=>s.listForms(),sql:'select * from flow.forms order by code, version',values:[]},
    {name:'forms-scope',invoke:(s:FlowFormsService)=>s.listForms(ID),sql:'select * from flow.forms where scope_id = $1::uuid order by code, version',values:[ID]},
    {name:'questions',invoke:(s:FlowFormsService)=>s.listQuestions(ID),sql:'select * from flow.questions where form_id = $1::uuid order by sort_order, key',values:[ID]},
    {name:'answers',invoke:(s:FlowFormsService)=>s.listAnswers(ID),sql:'select * from flow.answers where fill_id = $1::uuid order by created_at, id',values:[ID]},
  ];
  for(const shape of fixed){it(`captures exact fixed shape ${shape.name}`,async()=>{
    const value=opaque();const h=fixture([value.row]);const result=await shape.invoke(h.forms);expect(h.query).toHaveBeenCalledExactlyOnceWith(shape.sql,shape.values);expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function),{role:'reader',readonly:true});assertOpaque(result[0],value);
    console.log('FLOW_FORMS100_BASELINE '+JSON.stringify({family:shape.name,mask:0,calls:h.query.mock.calls}));
  });}
  it('listFormFills preserves the exact listFills form-only shape',async()=>{
    const h=fixture();expect(await h.forms.listFormFills(ID)).toEqual([]);expect(await h.forms.listFills({formId:ID})).toEqual([]);expect(h.query.mock.calls[0]).toEqual(h.query.mock.calls[1]);
  });
  it('ignores rowCount and preserves getter error identity',async()=>{
    const h=fixture();const unused=vi.fn(()=>{throw new Error('unused');});h.query.mockResolvedValueOnce({rows:[],get rowCount(){return unused();}});expect(await h.forms.listForms()).toEqual([]);expect(unused).not.toHaveBeenCalled();
    const error=new Error('row field');h.query.mockResolvedValueOnce({rows:[{get nested_value(){throw error;}}]});await expect(h.forms.listForms()).rejects.toBe(error);
  });
});
