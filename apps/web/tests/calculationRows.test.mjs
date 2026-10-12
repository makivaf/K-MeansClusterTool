import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import {spawnSync} from 'node:child_process'; import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const folder=path.join(root,'apps/api/private/method-runs/07b8c0b6-9789-4249-a27f-7dea49baa30f');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const names=['job.json','result.json','partitions.npz']; const before=names.map(n=>hash(path.join(folder,n)));
const python=process.env.RESEARCH_PYTHON || path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const run=spawnSync(python,['-B',path.join(root,'scripts/research/validation/derive_calculation_rows.py'),folder],{encoding:'utf8',windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}});
assert.equal(run.status,0,'Stored-label sidecar derivation must succeed; no participant output is reported');
const aggregate=JSON.parse(run.stdout); assert.equal(Object.keys(aggregate.variants).length,7);
for(const v of Object.values(aggregate.variants)){assert.equal(v.count,2437);assert.ok(v.meanError<=1e-9);assert.ok(v.sklearnMaxError<=1e-9);}
assert.deepEqual(names.map(n=>hash(path.join(folder,n))),before,'Immutable stored run and assignments must remain unchanged');
const api=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`import fs from 'node:fs'; import {withCalculationRows} from './apps/api/src/services/calculationRows.ts'; const job=JSON.parse(fs.readFileSync(process.argv[1]+'/job.json','utf8')); const enriched=await withCalculationRows(job,process.argv[2]); const calcs=[enriched.result.calculation,...enriched.result.commonSpace.spaces.flatMap(s=>Object.values(s.conditions).map(c=>c.calculation))]; console.log(JSON.stringify({count:calcs.filter(c=>c.participantSidecar?.count===enriched.result.common.participantCount).length,local:calcs.every(c=>c.participantSidecar?.url.startsWith('/api/method-runs/'))}));`,folder,path.dirname(folder)],{cwd:root,encoding:'utf8',windowsHide:true});
assert.equal(api.status,0,'API optional sidecar enrichment must succeed without exposing rows'); const metadata=JSON.parse(api.stdout);assert.equal(metadata.count,7);assert.equal(metadata.local,true);
console.log('PASS six common-space variants and native variant: full cohort, stored-mean equality, sklearn equality and immutable run sources; no fits');
