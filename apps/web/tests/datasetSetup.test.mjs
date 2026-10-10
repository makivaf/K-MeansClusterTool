import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ absWorkingDir:root, stdin:{contents:'export { default as App } from "./apps/web/src/App"; export { UploadAndCluster } from "./apps/web/src/pages/UploadAndCluster"; export * from "./apps/web/src/utils/validatedDataset";',resolveDir:root}, bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.VITE_API_URL':'undefined'},plugins:[{name:'analysis-boundary',setup(b){b.onLoad({filter:/useStudyFindings\.ts$/},()=>({contents:'export const useStudyFindings = () => ({ reset() {} });',loader:'ts'}));}}] });
const storage = new Map();
globalThis.sessionStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.window = {location:{origin:'http://localhost:5173'}};
let slots=[], cursor=0, pathname='/dataset-setup';
const react = {...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;const host=slots;return [host[i],v=>{host[i]=typeof v==='function'?v(host[i]):v;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(){},lazy:()=> 'lazy-page'};
const require=createRequire(import.meta.url), module={exports:{}};
vm.runInThisContext(`(function(require,module,exports){${bundle.outputFiles[0].text}\n})`)(id=>id==='react'?react:id==='react-router-dom'?{...require(id),useLocation:()=>({pathname})}:require(id),module,module.exports);
const {App,UploadAndCluster,DATASETS,readValidatedDataset,readValidatedFilenames}=module.exports;
let appSlots=[], pageSlots=[];
function find(node,predicate){if(Array.isArray(node))return node.flatMap(n=>find(n,predicate));if(!React.isValidElement(node))return [];return [...(predicate(node)?[node]:[]),...find(node.props.children,predicate),...find(node.props.action,predicate)];}
function props(){slots=appSlots;cursor=0;return find(App(),n=>n.props.setFiles)[0].props;}
function page(){slots=pageSlots;cursor=0;return UploadAndCluster(propsForPage);}
let propsForPage;
function render(){propsForPage=props();const tree=page();return {tree,html:renderToStaticMarkup(React.createElement(StaticRouter,{location:pathname},tree))};}
function choose(files,label='Select CSV files'){const {tree}=render();find(tree,n=>n.type==='input'&&n.props['aria-label']===label)[0].props.onChange({target:{files},currentTarget:{value:''}});}
const names=DATASETS.map(([,name])=>name), dataset={upload_ref:'test-validated-upload',filenames:names,file_count:7};
let uploads=0, fail=false;
globalThis.fetch=async (_url,options)=>{uploads++;assert.equal(options.method,'POST');assert.equal([...options.body.entries()].length,7);return {ok:!fail,json:async()=>fail?{error:'ADAS.csv: invalid export'}:dataset};};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function assertSelectionTable(html,status) {
 const table=html.match(/<table[^>]*><caption[^>]*>Required ADNI exports and validation status<\/caption>([\s\S]*?)<\/table>/)?.[1];
 assert.ok(table,'required datasets table is present');
 assert.equal((table.match(/<th\b/g)??[]).length,3,'only upload/selection columns before full validation');
 assert.equal((table.match(/<td\b/g)??[]).length,21,'each dataset row has three cells');
 assert.doesNotMatch(table,/Candidate variables|dataset-source-field|dataset-candidates|View variables|TOTAL13|LIMMTOTAL|NPISCORE/,'no provenance before full validation');
 if(status) assert.equal((table.match(new RegExp(`>${status}</span>`,'g'))??[]).length,7);
}
assert.match(render().html,/0 of 7 files selected/);
assertSelectionTable(render().html,'Missing');
assert.doesNotMatch(render().html,/Analysis-Ready Study-Entry Dataset/,'unvalidated exports cannot show a ready result');
const files=names.map(name=>new File(['test-only'],`All_Subjects_${name.replace('.csv','')}_10Aug2026.csv`,{type:'text/csv'}));
choose(files);
assert.match(render().html,/7 of 7 files selected/);
assertSelectionTable(render().html,'Selected');
assert.equal(find(render().tree,n=>n.type==='button')[0].props.disabled,false,'all selected files enable validation');
find(render().tree,n=>n.type==='button')[0].props.onClick();
assertSelectionTable(render().html,'Selected');
await flush();
assert.equal(uploads,1);
const setupHtml=render().html;
assert.match(setupHtml,/<th scope="col">Selected file<\/th><th scope="col">Candidate variables<\/th><th scope="col">Status<\/th>/);
assert.equal((setupHtml.match(/>Validated<\/span>/g)??[]).length,7);
assert.match(setupHtml,/<a[^>]*href="\/study-findings"[^>]*>Continue to Study Findings<\/a>/);
assert.match(setupHtml,/<details class="dataset-candidates"><summary[^>]*>View variables<\/summary>/);
for(const field of ['TOTAL13','CDRSB','FAQTOTAL','MMSCORE','LIMMTOTAL','LDELTOTAL','TRAASCOR','TRABSCOR','CATANIMSC','BNTTOTAL','AVTOT1–AVTOT5','AVDEL30MIN','AVTOT5 − AVDEL30MIN','NPISCORE','GDTOTAL']) assert.ok(setupHtml.includes(field),`source mapping ${field}`);
const audit=setupHtml.match(/<caption[^>]*>Variable Missingness Audit<\/caption>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1];
assert.ok(audit,'missingness audit renders after validation');
assert.equal((audit.match(/<tr\b/g)??[]).length,15);
assert.equal((audit.match(/>Retained<\/span>/g)??[]).length,13);
assert.equal((audit.match(/>Excluded<\/span>/g)??[]).length,2);
assert.doesNotMatch(audit,/&gt;20%/,'Decision badges show only the outcome');
assert.match(audit,/Boston Naming Test<\/th><td>1,730<\/td><td>707<\/td><td>2,437<\/td><td>29.01%/);
assert.match(audit,/NPI-Q<\/th><td>949<\/td><td>1,488<\/td><td>2,437<\/td><td>61.06%/);
assert.ok(setupHtml.indexOf('Study-Entry Cohort')<setupHtml.indexOf('Missingness Screening'));
assert.ok(setupHtml.indexOf('Missingness Screening')<setupHtml.indexOf('Candidate variables</dt>'));
assert.ok(setupHtml.indexOf('Candidate variables</dt>')<setupHtml.indexOf('Analysis-Ready Study-Entry Dataset'));
slots=appSlots;cursor=0;
const appHtml=renderToStaticMarkup(React.createElement(StaticRouter,{location:pathname},App()));
for(const section of appHtml.matchAll(/<nav[^>]*aria-label="Research sections"[^>]*>([\s\S]*?)<\/nav>/g)) {
 assert.ok(section[1].indexOf('Dataset Setup')<section[1].indexOf('Study Findings'));
 assert.ok(section[1].indexOf('Study Findings')<section[1].indexOf('K-Means Comparison'));
 assert.match(section[1],/02<\/span>Study Findings/);assert.match(section[1],/03<\/span>K-Means Comparison/);
}
for(const path of ['/dataset-setup','/simulation-runs','/study-findings','/simulation-runs','/dataset-setup']){
 pathname=path;pageSlots=[];const {html}=render();
 assert.match(html,/7 of 7 datasets validated/);assert.match(html,/Continue to Study Findings/);assert.doesNotMatch(html,/>Missing</);
 for(const file of files)assert.ok(html.includes(file.name));
}
assert.equal(uploads,1,'navigation and page remount never upload');
assert.equal(readValidatedDataset().upload_ref,dataset.upload_ref);
assert.equal(readValidatedFilenames()['ADAS.csv'],files[0].name);
assert.ok([...storage.values()].every(v=>!v.includes('test-only')),'only metadata is stored');
// New App instance restores backend identity and display names, but no raw files.
const liveApp=appSlots;appSlots=[];pageSlots=[];
assert.match(render().html,/7 of 7 datasets validated/);
assert.equal(Object.keys(props().files).length,0);
choose([new File(['replacement'],'ADAS.csv')],'Choose ADAS file');
assert.equal(Object.keys(props().validatedFiles).length,6);
assertSelectionTable(render().html);
assert.match(render().html,/Reselect all seven files/);
assert.equal(find(render().tree,n=>n.type==='button')[0].props.disabled,true);
// In the original live session, replacement requires no reselect of other files.
appSlots=liveApp;pageSlots=[];
choose([new File(['replacement'],'ADAS.csv')],'Choose ADAS file');
assert.equal(Object.keys(props().validatedFiles).length,6);
assert.equal(props().files['CDR.csv'],files[1]);
fail=true;find(render().tree,n=>n.type==='button')[0].props.onClick();await flush();
assert.match(render().html,/>Invalid</);assert.equal(props().invalidFiles.join(','),'ADAS.csv');
assertSelectionTable(render().html);
assert.match(render().html,/ADAS.csv: invalid export/,'existing validation error stays visible');
assert.equal(Object.keys(props().validatedFiles).length,6);
pathname='/study-findings';render();pathname='/dataset-setup';pageSlots=[];
assert.match(render().html,/>Invalid</);assert.equal(uploads,2);
assertSelectionTable(render().html);
assert.equal(readValidatedDataset(),null,'replacement invalidates batch metadata');
storage.set('ad-clustering.validated-dataset','not json');assert.equal(readValidatedDataset(),null);
console.log('PASS missing/selected/pending/successful/failed validation table states, validated provenance and disclosure, navigation and remount restoration, metadata-only refresh, replacement isolation, and no duplicate uploads');

