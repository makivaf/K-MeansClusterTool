import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { MethodExecutor } from "./methodExecution";
import { createMethodRunsRouter } from "../routes/methodRuns";
import { MethodResultSchema, compatibleMethods, type MethodRequest, type MethodJob } from "../../../../packages/shared/src/methodExecution";

import { methodFixture } from "./methodExecution.fixture";
import { withResearchCapacity } from "./researchExecutionCapacity";

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kmeans-method-test-"));
  const input = { scope: "simulation" as const, simulationId: 1, configuration: { sampleMode: "custom" as const, sampleCount:100,manualK:null } };
  let failEnhanced = false, running = 0, maximum = 0;
  const calls: string[] = [];
  const executor = new MethodExecutor(directory, async (job, _, signal, stage) => {
    calls.push(job.method); running++; maximum=Math.max(maximum,running); stage('evidence');
    try {
      await new Promise<void>((resolve,reject)=>{ const timer=setTimeout(resolve,35); signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('cancelled'));},{once:true}); });
      if (job.method === 'enhanced' && failEnhanced) throw Error('test failure');
      return methodFixture(job.method as 'standard'|'enhanced');
    } finally { running--; }
  }, false);
  const request = (method: MethodRequest['method']): MethodRequest => ({ method,input,requestId:crypto.randomUUID() });
  const finish = async (job: MethodJob) => {
    for(let i=0;i<300;i++) { const current=executor.get(job.id)!; if(!['running','queued'].includes(current.status)) return current; await new Promise(resolve=>setTimeout(resolve,10)); }
    throw Error('test timeout');
  };
  const app=express(); app.use(express.json());
  // Lifecycle fixtures do not create research assignment files. Exercise the
  // real evidence rejection separately rather than inventing fixture artifacts.
  app.use('/api/method-runs',createMethodRunsRouter(executor, async job => job));
  app.use('/api/evidence',createMethodRunsRouter(executor));
  const server=app.listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as {port:number}; const base=`http://127.0.0.1:${address.port}/api/method-runs`;
  try {
    let release!: () => void;
    const held = withResearchCapacity(() => new Promise<void>(resolve => { release = resolve; }));
    await new Promise(resolve => setImmediate(resolve));
    const queued = executor.start(request('standard'));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.length, 0, 'Legacy execution capacity must block new heavy work');
    executor.cancel(queued.id);
    release(); await held;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 0, 'Cancelled capacity waiter must never execute');
    const enhancedRequest=request('enhanced');
    const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(enhancedRequest)});
    assert.equal(response.status,202); const enhanced=await finish(await response.json() as MethodJob);
    assert.equal(enhanced.status,'complete');assert.deepEqual(calls,['enhanced'],'Enhanced must not run Standard');
    assert.equal(executor.start(enhancedRequest).id,enhanced.id,'idempotent retry');
    const standardRequest=request('standard');const standard=await finish(executor.start(standardRequest));assert.equal(standard.status,'complete');
    assert(compatibleMethods(standard.result,enhanced.result));
    const mismatched=structuredClone(enhanced.result!);mismatched.provenance.participantsHash='9'.repeat(64);assert(!compatibleMethods(standard.result,mismatched));
    assert.throws(()=>executor.start({...request('comparison'),standardId:standard.id,enhancedId:crypto.randomUUID()}));
    failEnhanced=true;
    const failed=await finish(executor.start(request('enhanced')));assert.equal(failed.status,'failed');assert.equal(executor.get(standard.id)?.status,'complete');assert.equal(executor.get(enhanced.id)?.status,'complete');
    failEnhanced=false;
    const retry=await finish(executor.start(request('enhanced')));assert.equal(retry.status,'complete');assert.notEqual(retry.id,enhanced.id);
    const first=executor.start(request('standard'));const second=executor.start(request('enhanced'));
    await finish(first);await finish(second);assert.equal(maximum,1,'No concurrent heavy jobs');
    const cancel=executor.start(request('standard'));await new Promise(resolve=>setTimeout(resolve,5));executor.cancel(cancel.id);await finish(cancel);assert.equal(executor.get(cancel.id)?.status,'cancelled');
    await new Promise(resolve=>setTimeout(resolve,20));
    const recovered=new MethodExecutor(directory,async()=>{throw Error('must not execute restoration')},false);assert.equal(recovered.get(standard.id)?.status,'complete');
    const get=await fetch(`${base}/${standard.id}`);assert.equal(get.status,200);
    assert.equal((await get.json() as MethodJob).result?.method,'standard');
    const missingEvidence = await fetch(`http://127.0.0.1:${address.port}/api/evidence/${standard.id}`);
    assert.equal(missingEvidence.status, 409, 'Production evidence path rejects missing assignment artifacts');
    const invalid=structuredClone(methodFixture('standard'));delete invalid.standard!.ariBySeed;assert(!MethodResultSchema.safeParse(invalid).success);
    console.log('PASS independent methods, either order, durable results, rerun/idempotency, isolated failure/retry, cancellation, serialization, compatibility, required evidence and HTTP endpoints');
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(directory,{recursive:true,force:true});
  }
}
void main();
