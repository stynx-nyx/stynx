import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { renderOutboxStorage, verifyOutboxStorage } from '../../packages/outbox/src/storage.js';
import { OUTBOX_STORAGE_CATALOG } from '../../packages/outbox/src/storage-catalog.generated.js';
import * as oq from '../../packages/outbox/src/storage.repository.js';
import { renderOfflineStorage, verifyOfflineStorage } from '../../packages/offline-sync/src/storage.js';
import { OFFLINE_STORAGE_CATALOG } from '../../packages/offline-sync/src/storage-catalog.generated.js';
import * as fq from '../../packages/offline-sync/src/storage.repository.js';
import { storageCatalogQueries } from '../../packages/data/src/storage-catalog.repository.js';
import type { StorageBindingOptions, StorageCatalogEntry, StorageVerifierTransaction } from '@stynx-nyx/data';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const variants: [string, StorageBindingOptions][] = [
  ['default', {}],
  ['custom', {ownerRole:'Owner_É',appRole:'AppRole',readerRole:'ReadRole',tenantTable:{schema:'Consumer',table:'Tenant',column:'Identity'}}],
  ['no-reader', {readerRole:null}],
  ['role-words', {ownerRole:'consumer_owner',appRole:'consumer_app',readerRole:null,tenantTable:{schema:'stynx_app',table:'stynx_reader',column:'stynx_owner'}}],
];
const families = [
  {name:'offline',catalog:OFFLINE_STORAGE_CATALOG,render:renderOfflineStorage,verify:verifyOfflineStorage, count:541,
    admission:fq.storageAdmission,visibility:fq.storageVisibility,roles:fq.storageRestrictedRoles,schema:fq.storageSchemaOwner,applicable:fq.storageApplicableRoles,privileges:fq.storagePrivileges,enforcement:fq.storageForeignKeyEnforcement},
  {name:'outbox',catalog:OUTBOX_STORAGE_CATALOG,render:renderOutboxStorage,verify:verifyOutboxStorage,count:336,
    admission:oq.outboxStorageAdmission,visibility:oq.outboxStorageVisibility,roles:oq.outboxStorageRoles,schema:oq.outboxStorageSchema,applicable:oq.outboxStorageApplicable,privileges:oq.outboxStoragePrivileges,enforcement:oq.outboxStorageEnforcement},
];
const golden: Record<string,string> = {
  "offline:default": "316744361c7638845a7e997a2399a6e4587e24fdbc6bd4e8dd202d646b60cc92",
  "offline:custom": "81a7eb9c5fb33b62642000e3fb4d9034dec26a273c3e249b5fcb53f7635204a7",
  "offline:no-reader": "8e1475204411e2431ac7daee3cce772afd247765826ae13a52c3be4ed64a2c32",
  "offline:role-words": "d7c9f5aed076a92086cb72c7a6a442e0734bba7a01a2bdf529cd529bb52e1fb9",
  "outbox:default": "f8bbad8bb1df2f0dc62a4aa8da508c4ce7acf4c62bf77460919cf43462b5d42d",
  "outbox:custom": "f17888909901b2eacf51f7db87537c713dc4939ade23c05fb4f73ecb62807b87",
  "outbox:no-reader": "9215484edafc9e05600a93b714d21fff6d5786a359b3c4e980ef62be3f09e7f8",
  "outbox:role-words": "b2634d56095e32da8f46ea6aa1252fe67e9349affeb049dc46a408bf8ffe9200"
};
const queryGolden: Record<string,string> = {
  "outbox:default": "7895b8353a950c56d67a20f92a282e7014f899fcad8a3fef4c522c8f7c23773a",
  "outbox:custom": "87155cf5e81a554e153ebc30bc477c384f22b3e9001c506d0b3693438ebcc587",
  "outbox:no-reader": "6473ef225dd1e3d68c23513a4a1649b2bfa04d38d75c56e39f80254965c99871",
  "outbox:role-words": "2736a117122acc37c9bc02e97997419a27308d540d02f517b24d41307ad5cfa4",
  "offline:default": "fc1bbc6def68bf2b00f30b4f96b25ea447364b150a6296fe73501fa41cc54c89",
  "offline:custom": "3fca0dcca553b6f37a82afca88c8e8e0c4dffffe0a73a0121847f1b910974335",
  "offline:no-reader": "0735af189e56e27a57e937d2ceadad0c8a0193cbfe703f7c3cdca561cb9bb37c",
  "offline:role-words": "73412bd5b8ca24737c4a694cc7ad0ae02b811665ff2e39c555bed0eef9b2e7f0"
};
export function runStorageCatalogPreservation(familyName: 'offline' | 'outbox'): void {
for (const family of families.filter(item=>item.name===familyName)) {
  describe(`${family.name} complete storage preservation`, () => {
    const generated = family.catalog.entries as unknown as StorageCatalogEntry[];
    it('proves every actual generated selected field using the real eleven query row schemas', () => {
      expect(generated).toHaveLength(family.count);
      const kinds = new Set<string>();
      for (const entry of generated) {
        const definition = storageCatalogQueries.find(item=>item.kind===entry.kind)!;
        expect(definition, entry.kind).toBeDefined();
        expect(definition.query.row.safeParse({name:entry.name,value:entry.value}).success, entry.name).toBe(true);
        kinds.add(entry.kind);
      }
      expect(kinds.size).toBe(family.name==='offline'?8:11);
    });
    it.each(variants)('preserves complete ordered artifact bytes for %s', (variant, options) => {
      const source = JSON.stringify(family.catalog), before = generated.slice();
      const first = family.render(options), second = family.render(options);
      expect(second).toEqual(first); expect(second).not.toBe(first);
      expect(first.manifest.catalog).not.toBe(generated);
      expect(first.manifest.catalog[0]).not.toBe(generated[0]);
      expect(JSON.stringify(family.catalog)).toBe(source);
      generated.forEach((entry,index)=>expect(entry).toBe(before[index]));
      const hash = digest({objectsSql:first.objectsSql,roleBindingsSql:first.roleBindingsSql,manifest:first.manifest,binding:first.binding});
      expect(hash).toBe(golden[`${family.name}:${variant}`]);
    });
    it('preserves extra own __proto__ and recursively bound fields without aliasing generated input',()=>{
      const entry = generated[0]!; const extra = JSON.parse('{"__proto__":{"marker":"stynx_owner"},"deep":["stynx_app"]}');
      Object.defineProperty(entry,'inspectorExtra',{value:extra,configurable:true,enumerable:true});
      try {
        const bound=family.render({ownerRole:'custom_owner',appRole:'custom_app'}).manifest.catalog[0]!;
        const actual=Reflect.get(bound,'inspectorExtra');
        expect(Object.hasOwn(actual,'__proto__')).toBe(true);
        expect(actual.__proto__).toEqual({marker:'custom_owner'});
        expect(actual.deep).toEqual(['custom_app']); expect(actual).not.toBe(extra);
        expect(extra.__proto__.marker).toBe('stynx_owner');
      } finally {Reflect.deleteProperty(entry,'inspectorExtra');}
    });
    it('retains distinct reader-null policy behavior including empty policy roles',()=>{
      const policy=generated.find(e=>e.kind==='policy')!; const old=policy.value.roles;
      policy.value.roles=['stynx_reader'];
      try {
        const target=family.render({readerRole:null}).manifest.catalog.filter(e=>e.kind==='policy'&&e.name===policy.name);
        if(family.name==='offline'){expect(target).toHaveLength(1);expect(target[0]!.value.roles).toEqual([]);} else expect(target).toEqual([]);
      } finally {policy.value.roles=old;}
    });
    it.each(['throw','cycle'] as const)('retains native clone %s failure before any verifier query', async(mode)=>{
      const entry=generated[0]!, sentinel=new Error('native clone sentinel');
      if(mode==='throw')Object.defineProperty(entry,'toJSON',{configurable:true,value(){expect(this).toBe(entry);throw sentinel;}});
      else Reflect.set(entry,'cycle',entry);
      const query=vi.fn(async()=>({rows:[]}));
      try {
        let caught:unknown;
        try {await family.verify({query});}catch(error){caught=error;}
        if(mode==='throw')expect(caught).toBe(sentinel);else expect(caught).toBeInstanceOf(TypeError);
        expect(query).not.toHaveBeenCalled();
      }finally{Reflect.deleteProperty(entry,'toJSON');Reflect.deleteProperty(entry,'cycle');}
    });
    it('refuses malformed generated artifacts before query while retaining native clone failures',async()=>{
      const original=generated[0]!;
      const samples: [string, unknown][]=[['unknown-kind',{...original,kind:'unrecognized'}],['missing-value',{kind:original.kind,name:original.name}],['null',null],['scalar',1],['array',[]],['toJSON-scalar',{...original,toJSON(){return 1;}}],['toJSON-undefined',{...original,toJSON(){return undefined;}}]];
      for(const [label,value]of samples){
        generated[0]=value as StorageCatalogEntry;
        const query=vi.fn(async()=>({rows:[]}));
        try {
          let caught:unknown;
          try{await family.verify({query});}catch(error){caught=error;}
          if(label==='toJSON-undefined')expect(caught).toBeInstanceOf(SyntaxError);
          else {expect(caught).toBeInstanceOf(TypeError);expect((caught as Error).message).toBe('Invalid storage catalog artifact');}
          expect(query).not.toHaveBeenCalled();
        } finally {generated[0]=original;}
      }
      expect(generated[0]).toBe(original);
    });
    it.each([{label:'null',roles:null},{label:'string',roles:'stynx_app'},{label:'numeric-element',roles:[123]}])('refuses malformed generated policy roles $label',({roles})=>{
      const entry=generated.find(e=>e.kind==='policy')!, original=entry.value.roles;
      entry.value.roles=roles;
      try {
        expect(()=>family.render()).toThrowError(new TypeError('Invalid storage catalog artifact'));
      }finally{entry.value.roles=original;}
    });
    it.each([...new Set(generated.map(entry=>entry.kind))])('refuses missing required generated value field for %s',kind=>{
      const index=generated.findIndex(entry=>entry.kind===kind), original=generated[index]!;
      const entry=JSON.parse(JSON.stringify(original));const field=Object.keys(entry.value)[0]!;delete entry.value[field];
      generated[index]=entry;
      try{
        expect(()=>family.render()).toThrowError(new TypeError('Invalid storage catalog artifact'));
        expect(generated[index]).toBe(entry);
      }finally{generated[index]=original;}
    });
    it('preserves source identifier refusal before issuing any configured FK SQL',async()=>{
      const entry=generated.find(e=>e.kind==='constraint'&&e.value.kind==='f')!, original=entry.name;
      entry.name='bad;source.constraint';
      try{const harness=port(),report=await family.verify(harness.trx);expect(report.checks.at(-1)?.id).toBe('verification-unavailable');expect(harness.calls.at(-1)?.sql).toBe(family.enforcement.text);expect(JSON.stringify(report.checks.at(-1))).not.toContain('bad;source');}
      finally{entry.name=original;}
    });
    function port(options: StorageBindingOptions={}, override?: (sql:string, values:unknown[])=>unknown[]|undefined){
      const artifact=family.render(options), {binding}=artifact;
      const calls:{sql:string;values:unknown[]}[]=[];
      const query=vi.fn(async(sql:string,values:unknown[]=[])=>{
        calls.push({sql,values}); const replaced=override?.(sql,values);if(replaced!==undefined)return {rows:replaced};
        if(sql===family.admission.text)return {rows:[{owner:binding.ownerRole,readonly:'on'}]};
        if(sql===family.visibility.text)return {rows:[{visible:true}]};
        if(sql===family.roles.text)return {rows:[binding.appRole,binding.readerRole].filter(x=>x!==null).map(name=>({name,superuser:false,bypass:false,owns:false,ownerMember:false,unsafeMembership:false}))};
        if(sql===family.schema.text)return {rows:[{owner:binding.ownerRole}]};
        const catalog=storageCatalogQueries.find(item=>item.query.text===sql);
        if(catalog)return {rows:artifact.manifest.catalog.filter(e=>e.kind===catalog.kind).map(({name,value})=>({name,value}))};
        if(sql===family.applicable.text)return {rows:[binding.appRole,binding.readerRole].filter(x=>x!==null).map(name=>({name}))};
        if(sql===family.enforcement.text||sql===oq.outboxStorageMarker.text)return {rows:[{valid:true}]};
        if(sql===oq.outboxStorageSequence.text)return {rows:[{available:true}]};
        if(sql.startsWith('select count(*)::text as count from '))return {rows:[{count:'0'}]};
        return {rows:[]};
      });
      return {query,calls,artifact,trx:{query} as StorageVerifierTransaction};
    }
    it.each(variants)('uses real checked catalog collection, configured FK SQL and readonly transaction for %s',async(_variant,options)=>{
      const harness=port(options), report=await family.verify(harness.trx,options);
      expect(report.supported).toBe(true);
      expect(report.checks.every(check=>check.status==='pass')).toBe(true);
      const catalogCalls=harness.calls.filter(call=>storageCatalogQueries.some(q=>q.query.text===call.sql));
      expect(catalogCalls.map(call=>call.sql)).toEqual(storageCatalogQueries.map(q=>q.query.text));
      expect(catalogCalls.map(call=>call.values)).toEqual(Array.from({length:11},()=>[family.name]));
      expect(harness.calls[0]).toEqual({sql:family.admission.text,values:[]});
      expect(digest(harness.calls)).toBe(queryGolden[`${family.name}:${_variant}`]);
    });
    it.each(['owner','readonly','visibility'] as const)('stops after failed %s admission',async(mode)=>{
      const harness=port({},sql=>sql===family.admission.text?[{owner:mode==='owner'?'wrong':'stynx_owner',readonly:mode==='readonly'?'off':'on'}]:sql===family.visibility.text&&mode==='visibility'?[{visible:false}]:undefined);
      const report=await family.verify(harness.trx);expect(report.supported).toBe(false);
      expect(harness.calls).toHaveLength(mode==='visibility'?2:1);
    });
    it('rejects malformed live policy rows at actual checked collection before applicability',async()=>{
      const policy=storageCatalogQueries.find(q=>q.kind==='policy')!;
      const harness=port({},sql=>sql===policy.query.text?[{name:'secret-policy',value:{command:'r',permissive:true,roles:[123],using:null,check:null}}]:undefined);
      const report=await family.verify(harness.trx);
      expect(report.supported).toBe(false);expect(report.checks.at(-1)?.id).toBe('verification-unavailable');
      expect(JSON.stringify(report)).not.toContain('secret-policy');
      expect(harness.calls.at(-1)?.sql).toBe(policy.query.text);
    });
    it.each(['unrelated','PUBLIC','stynx_app'])('keeps live grant relevance for %s',async(grantee)=>{
      const definition=storageCatalogQueries.find(q=>q.kind==='grant')!;
      const base=family.render().manifest.catalog.filter(e=>e.kind==='grant').map(({name,value})=>({name,value}));
      const extra={name:`private-extra-${grantee}`,value:{object:'private-object',grantee,privilege:'SELECT',grantable:false}};
      const harness=port({},sql=>sql===definition.query.text?[...base,extra]:undefined);
      const report=await family.verify(harness.trx);
      expect(report.supported).toBe(grantee==='unrelated');
      expect(report.checks.some(c=>c.id===`catalog-unexpected:grant:${extra.name}`)).toBe(grantee!=='unrelated');
      expect(JSON.stringify(report)).not.toContain('private-object');
    });
    it.each(['unrelated','PUBLIC','stynx_app'])('keeps live policy relevance for %s',async(role)=>{
      const definition=storageCatalogQueries.find(q=>q.kind==='policy')!;
      const base=family.render().manifest.catalog.filter(e=>e.kind==='policy').map(({name,value})=>({name,value}));
      const extra={name:`extra-${role}`,value:{command:'r',permissive:true,roles:[role],using:'private policy expression',check:null}};
      const harness=port({},sql=>sql===definition.query.text?[...base,extra]:undefined);
      const report=await family.verify(harness.trx);
      expect(report.supported).toBe(role==='unrelated');
      expect(report.checks.some(c=>c.id===`catalog-unexpected:policy:${extra.name}`)).toBe(role!=='unrelated');
      expect(JSON.stringify(report)).not.toContain('private policy expression');
    });
    it.each([false,true])('retains effective privilege and grant-option comparison %s',async(grantable)=>{
      const grant=family.render().manifest.catalog.find(e=>e.kind==='grant'&&e.value.grantee==='stynx_app')!;
      const row={role:'stynx_app',object:grant.value.object,parent:null,privilege:grant.value.privilege,allowed:true,grantable};
      const harness=port({},sql=>sql===family.privileges.text?[row]:undefined);
      const report=await family.verify(harness.trx);
      expect(report.supported).toBe(!grantable);
      expect(report.checks.find(c=>c.id.startsWith('effective-grant:'))?.status).toBe('pass');
      expect(report.checks.find(c=>c.id.startsWith('effective-grant-option:'))?.status).toBe(grantable?'fail':'pass');
    });
    it.each([null,[],['left','right']])('retains configured FK handling for columns %j',async(columns)=>{
      const entry=generated.find(e=>e.kind==='constraint'&&e.value.kind==='f')!;
      const old={...entry.value};
      Object.assign(entry.value,{columns,referencedColumns:columns,referencedSchema:'TargetSchema',referencedTable:'TargetTable'});
      try {
        const harness=port(),report=await family.verify(harness.trx);
        if(columns?.length){
          expect(report.supported).toBe(true);
          const query=harness.calls.find(call=>call.sql.includes('"TargetSchema"."TargetTable"'))!;
          expect(query.values).toEqual([]);
          expect(query.sql).toBe(`select count(*)::text as count from "${family.name}"."${entry.name.split('.')[0]}" child\n         where child."left" is not null and child."right" is not null and not exists(select 1 from "TargetSchema"."TargetTable" parent where child."left"=parent."left" and child."right"=parent."right")`);
          expect(query.sql.indexOf('parent."left"')).toBeLessThan(query.sql.indexOf('parent."right"'));
        }else{
          expect(report.checks.at(-1)?.id).toBe('verification-unavailable');
          expect(harness.calls.some(call=>call.sql.includes('"TargetSchema"."TargetTable"'))).toBe(false);
          expect(harness.calls.at(-1)?.sql).toBe(family.enforcement.text);
        }
      } finally{entry.value=old;}
    });
    it('keeps successful native toJSON receiver and cloned snapshot output',()=>{
      const entry=generated[0]!, snapshot=JSON.parse(JSON.stringify(entry));let calls=0;
      Object.defineProperty(entry,'toJSON',{configurable:true,value(){calls++;expect(this).toBe(entry);return {...snapshot,extra:'native'};}});
      try{const bound=family.render().manifest.catalog[0]!;expect(Reflect.get(bound,'extra')).toBe('native');expect(bound).not.toBe(snapshot);expect(calls).toBe(1);}
      finally{Reflect.deleteProperty(entry,'toJSON');}
    });
    it('preserves SQLSTATE-only reporting and stops at the exact failed query',async()=>{
      const sentinel=Object.assign(new Error('private credential'),{code:'42501'});
      const harness=port({},sql=>{if(sql===family.applicable.text)throw sentinel;return undefined;});
      const report=await family.verify(harness.trx);expect(report.checks.at(-1)?.reason).toContain('42501');
      expect(JSON.stringify(report)).not.toContain('private credential');expect(harness.calls.at(-1)?.sql).toBe(family.applicable.text);
    });
  });
}

}
