import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { StudyPreparationSchema, type StudyPreparation } from '../../../../packages/shared/src/studyPreparation';
import { analysisInputManifest, validateAnalysisInputManifest } from './analysisInputManifest';
import { resolveUploadDirectory } from './localUploadStore';
import { canonicalizeResearchPythonSource } from './researchSourceMaterializer';
import { sha256 } from './simulationCohort';
import { withResearchCapacity } from './researchExecutionCapacity';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const preparationSettings = {version:1, scope:['ADNI1','ADNIGO','ADNI2','ADNI3'], missingnessThreshold:0.20,
  imputation:'median', standardization:'population-z-score', pcaMinimumVariance:0.85};
const relevantSources = ['audit_adni_inputs.py','audit_candidate_mapping.py','reconcile_variable_dictionary.py',
  'construct_study_entry_cohort.py','audit_study_entry_scope_npiq.py','preprocess_study_entry.py'];
export function preparationIdentity(input: string) {
  validateAnalysisInputManifest(input);
  const sourceFilesHash=sha256(JSON.stringify(analysisInputManifest.map(({filename})=>[filename,sha256(fs.readFileSync(path.join(input,filename)))])));
  const codeHash=sha256(JSON.stringify([...relevantSources.map(name=>`scripts/research/study_entry/${name}`),
    'scripts/research/simulation/prepare_method_data.py', 'apps/api/src/services/studyPreparation.ts', 'apps/api/src/services/analysisInputManifest.ts']
    .map(name=>[name,sha256(canonicalizeResearchPythonSource(fs.readFileSync(path.join(root,name))))])));
  return {sourceFilesHash,codeHash,settingsHash:sha256(JSON.stringify(preparationSettings))};
}
export const preparationKey = (identity: ReturnType<typeof preparationIdentity>, dependenciesHash: string) =>
  sha256(JSON.stringify({...identity,dependenciesHash}));
export type PreparedStudy = {state: StudyPreparation; sourcePath:string; cacheDirectory:string};
const atomic=(file:string,value:unknown)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(value));fs.renameSync(temp,file);};
export function verifyPrepared(record: PreparedStudy) {
  const state=StudyPreparationSchema.parse(record.state);
  if(state.status!=='ready' || sha256(fs.readFileSync(record.sourcePath))!==state.sourceHash) throw Error('Prepared cohort integrity failure.');
  const cache=path.join(record.cacheDirectory,state.key!);
  for(const [folder, expectedKey, files] of [[cache,state.key,['standardized.csv','preparation.json','preprocessing.npz']],
    [path.join(cache,'pca'),sha256(state.key!+state.preprocessingHash!),['scores.npy','pca.json']]] as const) {
    const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));
    if(manifest.key!==expectedKey || JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify([...files].sort()) ||
      files.some(name=>sha256(fs.readFileSync(path.join(folder,name)))!==manifest.files[name])) throw Error('Prepared matrix integrity failure.');
  }
  if(sha256(fs.readFileSync(path.join(cache,'standardized.csv')))!==state.preprocessingHash ||
    sha256(fs.readFileSync(path.join(cache,'pca/scores.npy')))!==state.pcaHash) throw Error('Prepared matrix provenance failure.');
  return record;
}
type Builder=(uploadRef:string,directory:string,stage:(name:string)=>void)=>Promise<PreparedStudy>;
export class StudyPreparationStore {
  private active=new Set<string>();
  constructor(readonly directory=path.join(root,'apps/api/private/method-runs'), private builder:Builder=async(ref,dir,stage)=>{
    const {executeStudyPreparation}=await import('./methodExecution');return executeStudyPreparation(ref,dir,stage);
  }) {}
  private file(ref:string) {resolveUploadDirectory(ref);return path.join(this.directory,'prepared-refs',`${ref}.json`);}
  private input(ref:string) {return path.join(this.directory,'inputs',ref);}
  private save(ref:string,record:{state:StudyPreparation}|PreparedStudy) {atomic(this.file(ref),record);}
  invalidate(ref:string, error='Preparation is outdated. Retry preparation.') {
    this.save(ref,{state:{status:'error',stage:'invalidated',error}});
  }
  get(ref:string): StudyPreparation | null {
    let record: PreparedStudy;
    try {record=JSON.parse(fs.readFileSync(this.file(ref),'utf8'));} catch {return null;}
    try {
      if(record.state.status==='preparing'&&!this.active.has(ref)) throw Error('Preparation interrupted. Retry preparation.');
      if(record.state.status==='ready') this.requireReady(ref);
      return StudyPreparationSchema.parse(record.state);
    } catch {const state:StudyPreparation={status:'error',stage:'invalidated',error:'Preparation is interrupted, outdated, or failed integrity verification. Retry preparation.'};this.save(ref,{state});return state;}
  }
  requireReady(ref:string): PreparedStudy {
    const record=JSON.parse(fs.readFileSync(this.file(ref),'utf8')) as PreparedStudy;
    const identity=preparationIdentity(this.input(ref));
    const upload=resolveUploadDirectory(ref);
    if(fs.existsSync(upload)&&preparationIdentity(upload).sourceFilesHash!==identity.sourceFilesHash) throw Error('Validated upload changed.');
    if(Object.entries(identity).some(([key,value])=>record.state[key as keyof StudyPreparation]!==value)) throw Error('Preparation inputs or settings changed.');
    if(record.state.key!==preparationKey(identity,record.state.dependenciesHash!)) throw Error('Preparation key mismatch.');
    return verifyPrepared(record);
  }
  start(ref:string):StudyPreparation {
    const current=this.get(ref);
    if(current?.status==='preparing'||current?.status==='ready') return current;
    const upload=resolveUploadDirectory(ref), input=this.input(ref);
    if(fs.existsSync(upload)) {
      validateAnalysisInputManifest(upload);fs.mkdirSync(input,{recursive:true});
      for(const {filename} of analysisInputManifest) {
        const target=path.join(input,filename), bytes=fs.readFileSync(path.join(upload,filename));
        if(fs.existsSync(target)&&sha256(fs.readFileSync(target))!==sha256(bytes)) throw Error('Upload identity changed; validate a new upload.');
        if(!fs.existsSync(target))fs.writeFileSync(target,bytes);
      }
    }
    const identity=preparationIdentity(input);
    const state:StudyPreparation={status:'preparing',stage:'waiting_capacity',error:null,...identity};
    this.active.add(ref);this.save(ref,{state});
    void withResearchCapacity(async()=>{
      try {
        // Recheck after waiting: a code/input change cannot publish a stale ready state.
        const jobDirectory=path.join(this.directory,crypto.randomUUID());fs.mkdirSync(jobDirectory,{recursive:true});
        const result=await this.builder(ref,jobDirectory,stage=>this.save(ref,{state:{...state,stage}}));
        const latest=preparationIdentity(input);
        if(Object.entries(identity).some(([key,value])=>latest[key as keyof typeof identity]!==value)) throw Error('Preparation inputs changed during execution.');
        verifyPrepared(result);this.save(ref,result);
      } catch(error) {
        this.save(ref,{state:{...state,status:'error',stage:'error',error:'Dataset preparation failed. Retry preparation after checking the local research environment.'}});
        fs.appendFileSync(path.join(this.directory,'preparation-errors.log'),`${new Date().toISOString()} ${String(error)}\n`);
      } finally {this.active.delete(ref);}
    });
    return state;
  }
}
export const studyPreparationStore=new StudyPreparationStore();
