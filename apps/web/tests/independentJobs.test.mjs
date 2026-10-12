import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import ts from 'typescript';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../src/hooks/useMethodJobs.ts',import.meta.url),'utf8');
const calls=[];const storage=new Map();let respond;
const input={scope:'simulation',simulationId:1,configuration:{sampleMode:'custom',sampleCount:100,manualK:null}};
const schemas={MethodJobSchema:{parse:value=>value},compatibleMethods:(s,e)=>s?.provenance===e?.provenance&&!!s&&!!e};
function mount() {
  const slots=[];let cursor=0;const effects=[];
  const changed=(a,b)=>!a||a.some((v,i)=>v!==b[i]);
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial){const i=cursor++;return slots[i]??={current:initial};},
    useEffect(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps)){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn();});}}};
  const exports={};const modules={react,'../../../../packages/shared/src/methodExecution':schemas,'../config/api':{API_BASE_URL:'http://test'},'../utils/validatedDataset':{isDatasetReady:()=>true}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:id=>{assert(id in modules,id);return modules[id];},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},AbortController,crypto,
      setTimeout,clearTimeout,fetch:async(url,options)=>{calls.push({url,options});return respond(url,options);}});
  return{render(){cursor=0;const state=exports.useMethodJobs(input);effects.splice(0).forEach(fn=>fn());return state;},close(){slots.forEach(slot=>slot?.cleanup?.());}};
}
const response=value=>({ok:true,json:async()=>value});
let host=mount();let state=host.render();
respond=(_,options)=>{const body=JSON.parse(options.body);return response({id:body.requestId,input,method:body.method,status:'complete',result:{method:body.method,provenance:'same'},finishedAt:new Date().toISOString()});};
await state.run('enhanced');state=host.render();
assert.equal(JSON.parse(calls[0].options.body).method,'enhanced');assert.equal(calls.length,1);assert.equal(state.completed.enhanced.status,'complete');assert.equal(state.completed.standard,undefined);
await state.run('standard');state=host.render();assert.equal(state.compatible,true);const oldId=state.completed.standard.id;
await state.run('standard');state=host.render();assert.notEqual(state.completed.standard.id,oldId,'Rerun must POST a new identity');
const previous=state.completed.standard;
respond=()=>{throw Error('network interruption');};await state.run('standard');state=host.render();assert.equal(state.completed.standard,previous);const uncertain=JSON.parse(calls.at(-1).options.body).requestId;
respond=(_,options)=>{const body=JSON.parse(options.body);return response({id:body.requestId,input,method:body.method,status:'failed',result:null,error:'worker failed'});};
await state.run('standard');state=host.render();assert.equal(JSON.parse(calls.at(-1).options.body).requestId,uncertain,'Uncertain POST must retain idempotency identity');assert.equal(state.completed.standard,previous);assert.equal(state.completed.enhanced.status,'complete');
host.close();
console.log('PASS independent job POSTs, either order, rerun identity, idempotent uncertain retry, isolated failure and retained successes');
