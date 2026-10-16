import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StudyPreparationStore, preparationIdentity, preparationKey, verifyPrepared, type PreparedStudy } from './studyPreparation';
import { analysisInputManifest } from './analysisInputManifest';
import { sha256 } from './simulationCohort';
import { MethodExecutor } from './methodExecution';
import crypto from 'node:crypto';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-study-test-'));
const ref='upload-1791687600000-0123456789ab';
const input=path.join(directory,'inputs',ref);
fs.mkdirSync(input,{recursive:true});
for(const {filename,requiredColumns} of analysisInputManifest)fs.writeFileSync(path.join(input,filename),`${requiredColumns.join(',')}\n`);
const write=(file:string,value:unknown)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));};
let builds=0, fail=false, release:undefined|(()=>void);
const store=new StudyPreparationStore(directory,async()=>{
  builds++;await new Promise<void>(resolve=>{release=resolve;});if(fail)throw Error('fixture failure');
  const identity=preparationIdentity(input),dependenciesHash='a'.repeat(64),key=preparationKey(identity,dependenciesHash);
  const cacheDirectory=path.join(directory,'preprocessing'),cache=path.join(cacheDirectory,key);
  const sourcePath=path.join(directory,'cohort.csv');write(sourcePath,'synthetic cohort');
  const files={'standardized.csv':'matrix','preparation.json':'{}','preprocessing.npz':'private inputs'};
  for(const [name,value] of Object.entries(files))write(path.join(cache,name),value);
  write(path.join(cache,'manifest.json'),{key,files:Object.fromEntries(Object.entries(files).map(([name,value])=>[name,sha256(value)]))});
  const preprocessingHash=sha256(files['standardized.csv']);
  write(path.join(cache,'pca/scores.npy'),'scores');write(path.join(cache,'pca/pca.json'),'{}');
  write(path.join(cache,'pca/manifest.json'),{key:sha256(key+preprocessingHash),files:{'scores.npy':sha256('scores'),'pca.json':sha256('{}')}});
  return {sourcePath,cacheDirectory,state:{status:'ready',stage:'ready',error:null,...identity,key,dependenciesHash,
    sourceHash:sha256('synthetic cohort'),preprocessingHash,pcaHash:sha256('scores'),participantCount:2437,retainedVariables:Array(15).fill('fixture')}} as PreparedStudy;
});
const finish=async()=>{for(let i=0;i<30&&!release;i++)await new Promise(resolve=>setTimeout(resolve,5));assert(release);release();release=undefined;
  for(let i=0;i<50&&store.get(ref)?.status==='preparing';i++)await new Promise(resolve=>setTimeout(resolve,5));};
try {
  assert.equal(store.get(ref),null);
  const executor=new MethodExecutor(directory);
  assert.throws(()=>executor.start({requestId:crypto.randomUUID(),method:'standard',input:{scope:'study',uploadRef:ref}}),'Methods cannot start without preparation');
  assert.equal(store.start(ref).status,'preparing');assert.equal(store.start(ref).status,'preparing');await finish();
  assert.equal(store.get(ref)?.status,'ready');assert.equal(builds,1);
  assert.equal(store.start(ref).status,'ready');assert.equal(builds,1,'Ready requests must not rebuild or fit');
  const original=store.requireReady(ref), identity=preparationIdentity(input);
  for(const field of ['sourceFilesHash','codeHash','settingsHash'] as const)assert.notEqual(preparationKey({...identity,[field]:'f'.repeat(64)},'a'.repeat(64)),original.state.key);
  assert.notEqual(preparationKey(identity,'b'.repeat(64)),original.state.key);
  fs.appendFileSync(path.join(original.cacheDirectory,original.state.key!,'standardized.csv'),'changed');
  assert.throws(()=>verifyPrepared(original));assert.equal(store.get(ref)?.status,'error');
  fail=true;store.start(ref);await finish();assert.equal(store.get(ref)?.status,'error');
  fail=false;store.start(ref);await finish();assert.equal(store.get(ref)?.status,'ready');
  fs.appendFileSync(path.join(input,'ADAS.csv'),'changed\n');assert.equal(store.get(ref)?.status,'error');
  store.start(ref);await finish();assert.notEqual(store.requireReady(ref).state.key,original.state.key);
  const restarted=new StudyPreparationStore(directory);assert.equal(restarted.get(ref)?.status,'ready');
  write(path.join(directory,'prepared-refs',`${ref}.json`),{state:{status:'preparing',stage:'preprocessing',error:null}});
  assert.equal(restarted.get(ref)?.status,'error','An interrupted preparation must not remain ready or preparing');
  console.log('PASS preparation pending/ready/error/retry, idempotent reuse, input/settings/code/dependency keys, tamper rejection, method readiness gate and restart restoration');
} finally {assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
