import assert from 'node:assert/strict'; import fs from 'node:fs'; import {build} from 'esbuild'; import vm from 'node:vm'; import {createRequire} from 'node:module'; import {fileURLToPath} from 'node:url'; import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const bundle=await build({absWorkingDir:root,stdin:{contents:'export {InternalValidationCalculationDetails} from "./apps/web/src/components/InternalValidationCalculationDetails";',resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'undefined'}});
const module={exports:{}};vm.runInThisContext('(function(require,module,exports){'+bundle.outputFiles[0].text+'})')(createRequire(import.meta.url),module,module.exports);
const result=JSON.parse(fs.readFileSync(new URL('../../api/private/method-runs/07b8c0b6-9789-4249-a27f-7dea49baa30f/result.json',import.meta.url),'utf8'));
for(const space of result.commonSpace.spaces) for(const [name,condition] of Object.entries(space.conditions)){
 const c=condition.calculation;const html=renderToStaticMarkup(React.createElement(module.exports.InternalValidationCalculationDetails,{enhanced:{n:c.n,k:c.k,metrics:condition.mean,calculation:c},labels:{standard:'Standard',enhanced:name==='enhanced'?'Enhanced':'PCA + random'}}));
 const nums=kind=>html.match(new RegExp('data-formula="'+kind+'">([^<]+)'))[1].match(/[0-9][0-9,]*(?:\.[0-9]+)?/g).map(v=>Number(v.replaceAll(',','')));
 const db=nums('db');assert.ok(Math.abs((db[0]+db[1])/db[2]-db[3])<.0000005,'DB display substitution reproduces seed result within six-decimal input/output rounding');
 const ch=nums('ch');assert.ok(Math.abs((ch[0]/(ch[1]-ch[2]))/(ch[3]/(ch[4]-ch[5]))-ch[6])<.0000005,'CH display substitution reproduces seed result within six-decimal input/output rounding');
 assert.ok(html.includes(c.metrics.silhouette.toFixed(6)),'Worked example uses stored seed result rather than seed mean');
 assert.equal((html.match(/View Calculation Details/g)||[]).length,1);assert.doesNotMatch(html,/Run ranges|Representation:/);
}
console.log('PASS every common-space stored seed/deterministic DB and CH substitution and one disclosure per table');
