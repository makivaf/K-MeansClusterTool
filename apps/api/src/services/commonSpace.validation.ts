import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { CommonSpaceSchema, MethodResultSchema, compatibleMethods } from "../../../../packages/shared/src/methodExecution";
import { methodFixture } from "./methodExecution.fixture";
import { findReusableCohort } from "./cohortReuse";
const sha=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
// Synthetic contract fixtures keep this regression independent of private ADNI files.
const standard=methodFixture('standard'), enhanced=methodFixture('enhanced');
const metrics=standard.standard!.metrics, calculation=standard.calculation;
const comparison=Object.entries(metrics).map(([metric,value])=>({metric,existing:value,enhanced:value,difference:0,
  relativeImprovementPercent:0,favorableMethod:'equal',direction:metric==='davies_bouldin'?'lower_is_better':'higher_is_better'}));
const condition=(count:number)=>({runCount:count,mean:metrics,minimum:metrics,maximum:metrics,
  runs:Array.from({length:count},()=>metrics),calculation});
const pair=(count:number)=>({runCount:count,pairCount:count*(count-1)/2,mean:1,minimum:1,maximum:1,median:1,exactMatches:count*(count-1)/2});
const ari=Array.from({length:30},(_,seed)=>({seed,adjustedRandIndex:1}));
const evidence=CommonSpaceSchema.parse({version:'common-space-v1',
  spaces:['standardized_13','retained_pcs'].map((space,i)=>({space,dimensions:i?12:13,primary:!i,
    conditions:{standard:condition(30),pcaRandom:condition(30),enhanced:condition(3)},comparison})),
  pairwise:{standard:pair(30),pcaRandom:pair(30),enhanced:pair(3)},
  crossMethod:ari.map(row=>({seed:row.seed,ari:1,disagreementCount:0,disagreementPercent:0})),
  randomVersusDpc:ari,dpcAssignmentsIdentical:true});
const changes={silhouette:0,davies_bouldin:0,calinski_harabasz:0};
const fixture={...standard,method:'comparison',standard:undefined,commonSpace:evidence,comparison:evidence.spaces[0].comparison,
  pcaContribution:{k:2,runCount:30,existing:metrics,enhanced:metrics,relativeChange:changes},
  randomControl:{totalRandomRuns:30,matchingRuns:30,randomMean:metrics,randomSd:changes},
  sopControls:{pcaSilhouetteByK:standard.standard!.silhouetteByK,pcaRandom:{k:2,runCount:30,metrics,calculation},
    nbclustRandom:{k:2,runCount:30,metrics,calculation},relativeChange:{sop1:changes,sop2:changes,sop3:changes},randomAriBySeed:ari},
  comparisonSources:{standard:{resultHash:'a'.repeat(64),assignmentsHash:'b'.repeat(64)},enhanced:{resultHash:'c'.repeat(64),assignmentsHash:'d'.repeat(64)}}};
MethodResultSchema.parse(fixture);
const explicit=structuredClone(fixture);
explicit.commonSpace.version='common-space-v2';
assert(!MethodResultSchema.safeParse(explicit).success);
for(const space of explicit.commonSpace.spaces)space.matrixHash='1'.repeat(64);
for(const row of explicit.commonSpace.crossMethod){row.enhancedRun=1;row.agreementCount=100;}
MethodResultSchema.parse(explicit);
explicit.commonSpace.crossMethod[0].agreementCount=99;
assert(!MethodResultSchema.safeParse(explicit).success,'Aligned counts must sum to the cohort size');
const mismatched=structuredClone(fixture);mismatched.comparison[0].enhanced+=0.01;
assert(!MethodResultSchema.safeParse(mismatched).success,'Inconsistent comparison must not masquerade as a common-space result');
for (const corrupt of [(x:typeof evidence)=>{x.spaces[0].conditions.standard.runs.pop();},
  (x:typeof evidence)=>{x.spaces[0].conditions.standard.mean.silhouette+=0.01;},
  (x:typeof evidence)=>{x.spaces[0].comparison[0].enhanced+=0.01;},
  (x:typeof evidence)=>{x.spaces[0].comparison[0].difference=1;},
  (x:typeof evidence)=>{x.pairwise.standard.exactMatches=-1;},
  (x:typeof evidence)=>{x.crossMethod[0].seed=10;}]) {
  const invalid=structuredClone(evidence);corrupt(invalid);assert(!CommonSpaceSchema.safeParse(invalid).success);
}
assert(compatibleMethods(standard,enhanced));
for(const key of Object.keys(enhanced.provenance) as (keyof typeof enhanced.provenance)[]) {
  const invalid=structuredClone(enhanced);Object.assign(invalid.provenance,{[key]:'9'.repeat(64)});assert(!compatibleMethods(standard,invalid));
}
const legacy=structuredClone(enhanced);delete legacy.assignmentsHash;assert(!compatibleMethods(standard,legacy));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cohort-reuse-'));
try {
  const cohort=path.join(tmp,'cohorts','fixture'), source=path.join(cohort,'data/interim/study_entry_cohort_unimputed.csv');
  const write=(file:string,value:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
  write(source,'cohort');write(path.join(cohort,'data/raw/adni/input.csv'),'input');
  write(path.join(cohort,'scripts/research/study_entry/build.py'),'source\n');
  write(path.join(cohort,'source.json'),JSON.stringify({sha256:sha('cohort')}));
  write(path.join(tmp,crypto.randomUUID(),'request.json'),JSON.stringify({scope:'study',dependenciesHash:'deps',sourcePath:source,sourceHash:sha('cohort')}));
  const input=sha(JSON.stringify([['input.csv',sha('input')]])), code=[['build.py',sha('source\n')]];
  assert.equal(findReusableCohort(tmp,'deps',input,code,['input.csv']),cohort);
  assert.equal(findReusableCohort(tmp,'other',input,code,['input.csv']),undefined);
  assert.equal(findReusableCohort(tmp,'deps','other',code,['input.csv']),undefined);
  assert.equal(findReusableCohort(tmp,'deps',input,[['build.py','other']],['input.csv']),undefined);
  write(source,'tampered');assert.equal(findReusableCohort(tmp,'deps',input,code,['input.csv']),undefined);
} finally {assert(path.resolve(tmp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS common-space contract, means, ranges, cross-space rejection, configuration gating and cohort cache invalidation');
