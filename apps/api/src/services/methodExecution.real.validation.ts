/** Explicit opt-in integration exercise; computations stay in private storage. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { MethodExecutor } from "./methodExecution";
import { createMethodRunsRouter } from "../routes/methodRuns";
import { MethodJobSchema, compatibleMethods, type Method, type MethodInput } from "../../../../packages/shared/src/methodExecution";
import { frozenArtifactHashes } from "./simulationExecution";
import { createUploadDirectory, removeUploadDirectory } from "./localUploadStore";
import { analysisInputManifest, validateAnalysisInputManifest } from "./analysisInputManifest";
import { StudyPreparationStore } from './studyPreparation';
import { createStudyPreparationsRouter } from '../routes/studyPreparations';

async function main() {
  assert(process.argv.includes('--execute'), 'Use --execute to authorize real numerical work; --study runs full-cohort Standard only.');
  const root = process.cwd();
  const directory = path.join(root,'apps/api/private/method-benchmarks',`integration-${crypto.randomUUID()}`);
  const executor = new MethodExecutor(directory);
  const preparations = new StudyPreparationStore(directory);
  const before = frozenArtifactHashes();
  const study = process.argv.includes('--study');
  let uploaded: ReturnType<typeof createUploadDirectory> | undefined;
  let input: MethodInput = {scope:'simulation',simulationId:1,configuration:{sampleMode:'custom',sampleCount:300,manualK:null}};
  if (study) {
    uploaded = createUploadDirectory();
    for(const {filename} of analysisInputManifest) fs.copyFileSync(path.join(root,'data/raw/adni',filename),path.join(uploaded.directory,filename));
    validateAnalysisInputManifest(uploaded.directory);
    input = {scope:'study',uploadRef:uploaded.uploadRef};
  }
  const app=express(); app.use(express.json()); app.use('/api/method-runs',createMethodRunsRouter(executor));
  app.use('/api/study-preparations',createStudyPreparationsRouter(preparations));
  const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/method-runs`;
  const completed: Record<string, unknown> = {};
  const execute = async (method: Method, pair?: {standardId:string;enhancedId:string}) => {
    const started=performance.now();
    const requestId=crypto.randomUUID();
    const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,input,requestId,...pair})});
    assert.equal(response.status,202);
    let job=MethodJobSchema.parse(await response.json());
    let previous='';
    for(let i=0;i<1800;i++) {
      if(job.stage!==previous) { console.log(`${method}: ${job.stage}`); previous=job.stage; }
      if(!['running','queued'].includes(job.status)) break;
      await new Promise(resolve=>setTimeout(resolve,500));
      job=MethodJobSchema.parse(await (await fetch(`${base}/${job.id}`)).json());
    }
    assert.equal(job.status,'complete',`Inspect ${path.join(directory,job.id,'execution.log')}`);
    assert(job.result);
    completed[job.id]={method,wallSeconds:(performance.now()-started)/1000,timings:job.result.timings,cacheHits:job.result.cacheHits};
    fs.writeFileSync(path.join(directory,'integration-summary.json'),JSON.stringify(completed,null,2));
    console.log(JSON.stringify({method,id:job.id,...completed[job.id] as object}));
    return job;
  };
  try {
    if (study) {
      const url=base.replace('/method-runs',`/study-preparations/${uploaded!.uploadRef}`);
      const started=performance.now();
      let state=await (await fetch(url,{method:'POST'})).json();
      assert.equal(state.status,'preparing');
      let previous='';
      while(state.status==='preparing'){
        if(state.stage!==previous){console.log(`preparation: ${state.stage}`);previous=state.stage;}
        await new Promise(resolve=>setTimeout(resolve,1000));state=await (await fetch(url)).json();
        assert(performance.now()-started<900000,'Preparation timeout');
      }
      assert.equal(state.status,'ready',`Inspect ${directory}/preparation-errors.log`);
      const record=preparations.requireReady(uploaded!.uploadRef);
      const reference=JSON.parse(fs.readFileSync(path.join(root,'apps/api/private/method-runs/eb728b68-dd53-4940-9242-510f0d51eace/result.json'),'utf8'));
      assert.equal(state.sourceHash,reference.provenance.sourceHash);
      assert.equal(state.preprocessingHash,reference.provenance.preprocessingHash);
      assert.equal(state.pcaHash,reference.provenance.pcaHash);
      // All constructor outputs, including duplicate provenance and missingness,
      // must match the last verified unoptimized construction byte for byte.
      const referenceRequest=JSON.parse(fs.readFileSync(path.join(root,'apps/api/private/method-runs/eb728b68-dd53-4940-9242-510f0d51eace/request.json'),'utf8'));
      for(const filename of ['study_entry_cohort_unimputed.csv','study_entry_missingness_audit.csv','study_entry_phase_missingness.csv',
        'study_entry_duplicate_qc.csv','study_entry_exclusion_decisions.csv'])
        assert.deepEqual(fs.readFileSync(path.join(path.dirname(record.sourcePath),filename)),fs.readFileSync(path.join(path.dirname(referenceRequest.sourcePath),filename)),filename);
      completed.preparation={wallSeconds:(performance.now()-started)/1000,...state};
      console.log(JSON.stringify({preparation:completed.preparation}));
      const hit=await (await fetch(url,{method:'POST'})).json();assert.equal(hit.key,state.key);
      assert.equal(preparations.requireReady(uploaded!.uploadRef).sourcePath,record.sourcePath);
      const standard=await execute('standard');
      assert.equal(standard.result!.common.participantCount,2437);
      assert.equal(standard.result!.standard!.runs.length,30);
      assert.equal(standard.result!.enhanced,undefined);
      assert.equal(standard.result!.timings.nbclust,0);
      const rerun = await execute('standard');
      assert.notEqual(rerun.id, standard.id);
      assert.deepEqual(rerun.result!.standard, standard.result!.standard);
      assert.equal(rerun.result!.timings.cohort_cache_hit, 1);
      assert.deepEqual(rerun.result!.cacheHits, {preprocessing:true,pca:true});
      const restored=new MethodExecutor(directory);
      assert.deepEqual(restored.get(standard.id)?.result,standard.result);
    } else {
      const enhanced=await execute('enhanced');
      assert.equal(enhanced.result!.standard,undefined);
      assert.equal(enhanced.result!.enhanced!.dpc.ariByRun!.length,3);
      assert.deepEqual(enhanced.result!.cacheHits,{preprocessing:false,pca:false});
      const standard=await execute('standard');
      assert.equal(standard.result!.standard!.runs.length,30);
      assert(compatibleMethods(standard.result,enhanced.result));
      assert.deepEqual(standard.result!.cacheHits,{preprocessing:true,pca:true});
      const comparison = await execute('comparison',{standardId:standard.id,enhancedId:enhanced.id});
      assert(comparison.result!.commonSpace);
      assert.equal(comparison.result!.commonSpace.spaces[0].conditions.standard.runs.length, 30);
      assert.equal(comparison.result!.comparisonSources!.standard.assignmentsHash, standard.result!.assignmentsHash);
      const rerunEnhanced=await execute('enhanced');
      const rerunStandard=await execute('standard');
      assert.notEqual(rerunEnhanced.id,enhanced.id); assert.notEqual(rerunStandard.id,standard.id);
      assert.deepEqual(rerunEnhanced.result!.labels,enhanced.result!.labels);
      assert.deepEqual(rerunStandard.result!.standard,standard.result!.standard);
      assert.deepEqual(rerunEnhanced.result!.cacheHits,{preprocessing:true,pca:true});
      const restored=new MethodExecutor(directory);
      assert.deepEqual(restored.get(standard.id)?.result,standard.result);
      assert.deepEqual(restored.get(enhanced.id)?.result,enhanced.result);
    }
    assert.deepEqual(frozenArtifactHashes(),before,'Frozen outputs must remain byte-identical');
    console.log(`PASS real ${study?'uploaded full-cohort Standard':'Enhanced-first, Standard, comparison and genuine warm reruns'}; independent durable results and unchanged frozen artifacts. ${directory}`);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    if(uploaded) removeUploadDirectory(uploaded.directory);
  }
}
void main();
