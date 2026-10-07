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
assert.match(render().html,/0 of 7 files selected/);
const files=names.map(name=>new File(['test-only'],`All_Subjects_${name.replace('.csv','')}_10Aug2026.csv`,{type:'text/csv'}));
choose(files);
assert.match(render().html,/7 of 7 files selected/);
find(render().tree,n=>n.type==='button')[0].props.onClick();await flush();
assert.equal(uploads,1);
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
assert.match(render().html,/Reselect all seven files/);
assert.equal(find(render().tree,n=>n.type==='button')[0].props.disabled,true);
// In the original live session, replacement requires no reselect of other files.
appSlots=liveApp;pageSlots=[];
choose([new File(['replacement'],'ADAS.csv')],'Choose ADAS file');
assert.equal(Object.keys(props().validatedFiles).length,6);
assert.equal(props().files['CDR.csv'],files[1]);
fail=true;find(render().tree,n=>n.type==='button')[0].props.onClick();await flush();
assert.match(render().html,/>Invalid</);assert.equal(props().invalidFiles.join(','),'ADAS.csv');
assert.equal(Object.keys(props().validatedFiles).length,6);
pathname='/study-findings';render();pathname='/dataset-setup';pageSlots=[];
assert.match(render().html,/>Invalid</);assert.equal(uploads,2);
assert.equal(readValidatedDataset(),null,'replacement invalidates batch metadata');
storage.set('ad-clustering.validated-dataset','not json');assert.equal(readValidatedDataset(),null);
console.log('PASS seven-file selection/validation, navigation and remount restoration, metadata-only refresh, replacement isolation, failed validation, and no duplicate uploads');

