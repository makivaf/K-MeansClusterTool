"""Aggregate-only Oct 12 verification. No clustering, PCA, or NbClust fits.

Only longitudinal MixedLM fits are executed. Outputs are confined to docs.
"""
from pathlib import Path
import csv, json, hashlib, subprocess, re, sys, warnings, importlib.util
from collections import Counter
from itertools import combinations
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from scipy.stats import chi2
from sklearn.metrics import adjusted_rand_score, silhouette_samples, davies_bouldin_score, calinski_harabasz_score
from sklearn.metrics.pairwise import euclidean_distances
from sklearn.metrics.cluster import contingency_matrix
import statsmodels.formula.api as smf

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT/'docs/verification'
SNAP = ROOT/'apps/api/private/longitudinal-refresh/4b3dca3d-b435-4485-ac2b-18a0e442a624'
ENH = ROOT/'apps/api/private/method-runs/9313513c-93d0-407b-9647-0570ad9fa54a'
KEYS = ['silhouette','davies_bouldin','calinski_harabasz']
sources = {}
def relative(p): return Path(p).relative_to(ROOT).as_posix()
def cite(p):
    p=Path(p); sources[relative(p)] = hashlib.sha256(p.read_bytes()).hexdigest(); return relative(p)
def readcsv(p): cite(p); return pd.read_csv(p, dtype={'RID':str,'PTID':str})
def readjson(p): cite(p); return json.loads(Path(p).read_text(encoding='utf-8'))
def save(name,d):
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/name).write_text(json.dumps(d,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def git(*args): return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace',check=True).stdout
def existing_state():
    rows=git('status','--porcelain=v1','--untracked-files=all').splitlines()
    values={}
    for row in rows:
        name=row[3:].strip('"')
        if name=='docs/PIPELINE_VERIFICATION_OCT12.md' or name.startswith('docs/verification/') or name=='scripts/research/validation/verify_pipeline_oct12.py': continue
        p=ROOT/name
        if p.is_file(): values[name]={'status':row[:2],'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
    return {'branch':git('branch','--show-current').strip(),'head':git('rev-parse','HEAD').strip(),'indexSha256':hashlib.sha256((ROOT/'.git/index').read_bytes()).hexdigest(),'existingChanges':values}
def canonical(row):
    m={}; return tuple(m.setdefault(int(v),len(m)) for v in row)
def agreement(a,b):
    c=contingency_matrix(a,b); i,j=linear_sum_assignment(-c)
    return {'ari':float(adjusted_rand_score(a,b)),'alignedMatchCount':int(c[i,j].sum()),'alignedDifferenceCount':int(len(a)-c[i,j].sum())}
def reproduction(labels):
    keys=[canonical(r) for r in labels]; counts=Counter(keys); modal=max(counts,key=counts.get)
    pair=[float(adjusted_rand_score(a,b)) for a,b in combinations(labels,2)]
    return {'executions':len(labels),'pairwiseCount':len(pair),'pairwiseAriMean':float(np.mean(pair)),'pairwiseAriMin':min(pair),'pairwiseAriMax':max(pair),'distinctPartitions':len(counts),'partitionFrequencies':sorted(counts.values(),reverse=True),'referenceIndex':0,'seed0ExactIncludingSelf':counts[keys[0]],'seed0ExactExcludingSelf':counts[keys[0]]-1,'excludingSelfDenominator':len(labels)-1,'modalExact':counts[modal]}
def labels_csv(p,ids):
    d=readcsv(p); seeds=sorted(d.seed.unique()); arrays=[]
    for seed in seeds:
        sub=d[d.seed==seed].set_index('RID'); assert sub.index.is_unique and set(sub.index)==set(ids)
        arrays.append(sub.loc[ids,'cluster_label'].to_numpy(int))
    return np.array(arrays),[int(v) for v in seeds]
def longitudinal():
    script=ROOT/'scripts/research/longitudinal/fit_longitudinal_mixed_model.py'; cite(script)
    spec=importlib.util.spec_from_file_location('reference_model',script); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    mod.ASSIGNMENTS_PATH=SNAP/'data/interim/unified_cluster_assignments.csv'
    mod.LONGITUDINAL_COHORT_PATH=SNAP/'data/interim/unified_longitudinal_cohort.csv'
    cite(mod.ASSIGNMENTS_PATH);cite(mod.LONGITUDINAL_COHORT_PATH)
    data=mod.validate_and_prepare_model_data()
    stored=readjson(SNAP/'data/interim/unified_longitudinal_mixed_model.json')
    def fit(re_formula,optimizers):
        attempts=[]
        for optimizer in optimizers:
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('always')
                fitted=smf.mixedlm(mod.IMPLEMENTATION_FORMULA,data,groups=data.participant_group,re_formula=re_formula,missing='raise').fit(reml=False,method=optimizer,maxiter=2000,full_output=True,disp=False)
            attempts.append({'optimizer':optimizer,'converged':bool(fitted.converged),'warnings':list(dict.fromkeys(str(w.message) for w in caught))})
            if fitted.converged: break
        cov=np.array(fitted.cov_re); eigen=np.linalg.eigvalsh(cov)
        ci=fitted.conf_int(); effects={k:{'estimate':float(v),'standardError':float(fitted.bse[k]),'ci95':[float(x) for x in ci.loc[k]],'pValue':float(fitted.pvalues[k])} for k,v in fitted.fe_params.items()}
        return fitted,{'formula':mod.IMPLEMENTATION_FORMULA,'randomFormula':re_formula,'estimation':'ML','optimizerAttempts':attempts,'converged':bool(fitted.converged),'fixedEffects':effects,'randomCovariance':cov.tolist(),'randomVariances':np.diag(cov).tolist(),'randomCorrelation':float(cov[0,1]/np.sqrt(cov[0,0]*cov[1,1])) if len(cov)>1 else None,'covarianceEigenvalues':eigen.tolist(),'singularFit':bool(eigen.min()<=1e-8),'singularCriterion':'minimum covariance eigenvalue <= 1e-8; diagnostic, not a changed fitting threshold','residualVariance':float(fitted.scale),'logLikelihood':float(fitted.llf),'AIC':float(fitted.aic),'BIC':float(fitted.bic),'parameterCountIncludingResidual':len(fitted.params)+1}
    print('Fitting authorized reference longitudinal model',flush=True)
    intercept,a=fit('1',mod.OPTIMIZERS)
    print('Fitting authorized random-slope sensitivity model',flush=True)
    slope,b=fit('1 + time_years',['lbfgs'])
    mapping=mod.canonical_coefficient_names(intercept)
    errors={r['term']:{k:a['fixedEffects'][mapping[r['term']]][k]-r[k] for k in ['estimate','standardError','pValue']} for r in stored['fixedEffects']}
    maxerr=max(abs(v) for row in errors.values() for v in row.values())
    lr=2*(slope.llf-intercept.llf); df=len(slope.params)-len(intercept.params)
    result={'sources':{'input':relative(mod.LONGITUDINAL_COHORT_PATH),'assignments':relative(mod.ASSIGNMENTS_PATH),'reference':relative(SNAP/'data/interim/unified_longitudinal_mixed_model.json'),'implementation':relative(script)},'participants':int(data.participant_group.nunique()),'observations':len(data),'randomIntercept':a,'randomSlope':b,'referenceErrors':errors,'referenceMaxAbsoluteError':maxerr,'referenceMatchesAt1e8':maxerr<1e-8,'likelihoodRatio':{'statistic':float(lr),'nominalDegreesFreedom':int(df),'nominalChiSquareP':float(chi2.sf(max(0,lr),df)),'note':'Nominal chi-square only: zero slope variance is on the boundary and slope/intercept covariance is unidentified under the null. Ordinary chi-square calibration is not exact; no calibrated bootstrap or mixture test was performed.'}}
    save('longitudinal.json',result); return result
def history_search():
    revisions=git('rev-list','--all').splitlines(); refs=git('for-each-ref','--format=%(refname)').splitlines()
    patterns=['1.22567','1443.226','1.224116','1442.023132']
    proc=subprocess.run(['git','grep','-l','-E',r'1\.22567|1443\.226|1\.224116|1442\.023132',*revisions,'--',':!package-lock.json'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
    assert proc.returncode in (0,1)
    hits=[]
    for row in proc.stdout.splitlines():
        rev,path=row.split(':',1); body=git('show',rev+':'+path)
        hits.append({'commit':rev,'path':path,'occurrences':{p:body.count(p) for p in patterns if p in body}})
    local=[]
    for folder in ['docs','scripts','apps','packages','data','analysis']:
        for p in (ROOT/folder).rglob('*'):
            if not p.is_file() or p.suffix.lower() not in ['.json','.csv','.md','.txt','.ts','.tsx','.py','.mjs','.cjs','.log']: continue
            if 'node_modules' in p.parts or 'verification' in p.parts or p.name=='PIPELINE_VERIFICATION_OCT12.md' or p.name=='verify_pipeline_oct12.py':continue
            body=p.read_text(encoding='utf-8',errors='replace')
            found={v:body.count(v) for v in patterns if v in body}
            if found: local.append({'path':relative(p),'occurrences':found})
    result={'searchedReachableCommits':len(revisions),'refs':refs,'historicalMatches':hits,'localMatches':local,'scope':'All commits reachable from local refs, plus local docs/tests/source/artifacts. No remote fetch; unreachable/deleted history and external thesis drafts not available.'}
    save('provenance_search.json',result); return result
def main():
    before=existing_state();save('workspace_integrity_before.json',before)
    long=readjson(OUT/'longitudinal.json') if '--resume' in sys.argv else longitudinal()
    if '--resume' in sys.argv:
        for value in long['sources'].values(): cite(ROOT/value)
    Xdf=readcsv(ROOT/'data/interim/clustering_features_standardized.csv'); ids=Xdf.RID.tolist(); assert len(set(ids))==len(ids)
    X=Xdf.drop(columns=['RID','PTID']).to_numpy(float)
    Zdf=readcsv(ROOT/'data/interim/clustering_pca_scores.csv').set_index('RID'); assert set(Zdf.index)==set(ids)
    Z=Zdf.loc[ids].drop(columns=['PTID']).to_numpy(float)
    standard,seeds=labels_csv(ROOT/'data/interim/baseline_kmeans_assignments.csv',ids)
    random,rseeds=labels_csv(ROOT/'data/interim/dpc_comparison_random_assignments.csv',ids)
    cite(ENH/'partitions.npz')
    with np.load(ENH/'partitions.npz',allow_pickle=False) as saved:
        index={str(v):i for i,v in enumerate(saved['ids'])};assert set(index)==set(ids)
        enhanced=saved['labels'][:,[index[v] for v in ids]].copy()
    reference=readcsv(ROOT/'data/interim/unified_cluster_assignments.csv').set_index('RID').loc[ids,'cluster_label'].to_numpy(int)
    modelref=readcsv(SNAP/'data/interim/unified_cluster_assignments.csv').set_index('RID').loc[ids,'cluster_label'].to_numpy(int)
    assert np.array_equal(reference,enhanced[0]); assert enhanced.shape[1]==len(ids)
    assert seeds==rseeds==list(range(len(standard)))
    rep={name:reproduction(a) for name,a in [('standard',standard),('pcaRandom',random),('enhanced',enhanced)]}
    cross=[{'seed':seed,**agreement(row,enhanced[0])} for seed,row in zip(seeds,standard)]
    rep['standardVersusEnhanced']={'seed0':cross[0],'perSeed':cross,'minARI':min(v['ari'] for v in cross),'exactMatches':sum(v['alignedDifferenceCount']==0 for v in cross)}
    rep['pcaRandomVersusEnhanced']={'exactMatches':sum(agreement(row,enhanced[0])['alignedDifferenceCount']==0 for row in random),'perSeed':[{'seed':i,**agreement(row,enhanced[0])} for i,row in enumerate(random)]}
    rep['assignmentLinkage']={'fullCohort':agreement(enhanced[0],modelref),'literalLabelMatches':int(np.sum(enhanced[0]==modelref)),'allEnhancedRepetitionsMatchModel':bool(all(np.array_equal(row,modelref) for row in enhanced))}
    rep['sources']={'standard':'data/interim/baseline_kmeans_assignments.csv','pcaRandom':'data/interim/dpc_comparison_random_assignments.csv','enhanced':relative(ENH/'partitions.npz'),'modelAssignments':relative(SNAP/'data/interim/unified_cluster_assignments.csv')}
    save('reproducibility.json',rep)
    print('Computing common-space metrics from stored labels only',flush=True)
    metric={}; checks=[]
    expected={'13D':{'standard':[.331875010,1.224116077,1442.023132],'enhanced':[.331697426,1.224725785,1442.018807]},'6-PC':{'standard':[.372856414,1.075296075,1799.974419],'enhanced':[.372700472,1.075885031,1800.024958]}}
    for space,matrix in [('13D',X),('6-PC',Z)]:
        distances=euclidean_distances(matrix);np.fill_diagonal(distances,0);cache={}; conditions={}
        for name,series in [('standard',standard),('pcaRandom',random),('enhanced',enhanced[:1])]:
            runs=[]
            for labels in series:
                key=canonical(labels)
                if key not in cache: cache[key]=[float(silhouette_samples(distances,labels,metric='precomputed').mean()),float(davies_bouldin_score(matrix,labels)),float(calinski_harabasz_score(matrix,labels))]
                runs.append(cache[key])
            values=np.array(runs)
            conditions[name]={k:{'mean':float(values[:,i].mean()),'SD':float(values[:,i].std(ddof=1)) if len(values)>1 else None,'min':float(values[:,i].min()),'max':float(values[:,i].max())} for i,k in enumerate(KEYS)}
        differences={k:{'enhancedMinusStandardMean':conditions['enhanced'][k]['mean']-conditions['standard'][k]['mean'],'enhancedWithinStandardRange':conditions['standard'][k]['min']<=conditions['enhanced'][k]['mean']<=conditions['standard'][k]['max']} for k in KEYS}
        metric[space]={'dimensions':matrix.shape[1],'conditions':conditions,'differences':differences,'matrixSource':'data/interim/'+('clustering_features_standardized.csv' if space=='13D' else 'clustering_pca_scores.csv'),'SDConvention':'sample SD, ddof=1','matrixHash':hashlib.sha256(np.ascontiguousarray(matrix,dtype='<f8').tobytes()).hexdigest()}
        for name,targets in expected[space].items():
            for key,target in zip(KEYS,targets):
                actual=conditions[name][key]['mean'];precision=6 if key=='calinski_harabasz' else 9;tolerance=.5*10**(-precision)
                checks.append({'space':space,'method':name,'metric':key,'userSuppliedRoundedComparison':target,'computed':actual,'difference':actual-target,'roundingTolerance':tolerance,'mismatch':abs(actual-target)>tolerance})
    save('common_space_metrics.json',{'spaces':metric,'comparisonChecks':checks,'labelSources':rep['sources']})
    votes=readcsv(ROOT/'data/interim/clustering_nbclust_votes.csv').fillna('');selected=readcsv(ROOT/'data/interim/clustering_selected_k.csv').fillna('')
    nb={'indices':votes.to_dict(orient='records'),'statusCounts':dict(Counter(votes.status)),'voteCounts':dict(Counter(str(int(float(v))) for v in votes.recommended_k if str(v)!='')),'selectedArtifact':selected.to_dict(orient='records'),'source':'data/interim/clustering_nbclust_votes.csv','seedSource':'data/interim/clustering_selected_k.csv'}
    save('nbclust.json',nb)
    payload=[]
    for p in (ROOT/'apps/api/private/method-runs').glob('*/job.json'):
        d=json.loads(p.read_text())
        if d.get('method')=='standard' and d.get('status')=='complete':
            result=d.get('result',{}); series=result.get('standard',{}).get('silhouetteByK',[])
            disk=p.parent/'result.json'; stored=json.loads(disk.read_text()) if disk.exists() else {}
            payload.append({'jobSource':cite(p),'resultSource':cite(disk) if disk.exists() else None,'participantCount':result.get('common',{}).get('participantCount'),'kValues':[v['k'] for v in series],'presentAtStoredComplete':bool(series),'jobResultEqualsResultFile':result==stored})
    save('completion_payload.json',{'field':'result.standard.silhouetteByK','jobs':payload,'sourceOrder':['scripts/research/simulation/run_method.py: construct standard.silhouetteByK','scripts/research/simulation/run_method.py: atomic write result.json','apps/api/src/services/methodExecution.ts: executeMethod parses and validates result, writes evidence-enriched result.json, returns','apps/api/src/services/methodExecution.ts: drain saves job.json with status complete and result']})
    hist=history_search()
    runs=readcsv(ROOT/'data/interim/baseline_kmeans_runs.csv');prep=readcsv(ROOT/'data/interim/clustering_preprocessing_summary.csv')
    provenance={'current':{'cohortSource':'data/interim/study_entry_cohort_unimputed.csv','cohortSHA256':cite_and_hash(ROOT/'data/interim/study_entry_cohort_unimputed.csv'),'participants':len(ids),'features':list(Xdf.drop(columns=['RID','PTID']).columns),'featureCount':X.shape[1],'imputation':'per-variable median; verified against saved unimputed/imputed matrices','standardization':'z-score using recorded scaler mean/scale','seeds':[int(v) for v in runs.seed],'n_init':sorted(int(v) for v in runs.n_init.unique()),'evaluationSpace':'standardized original features','DBI':metric['13D']['conditions']['standard']['davies_bouldin']['mean'],'CH':metric['13D']['conditions']['standard']['calinski_harabasz']['mean']},'earlier':{'provenance':'Undeterminable: occurrences in reachable history are an explicit unresolved-value note, not a producing artifact. No evidence establishes 15 versus 13 variables, cohort, imputation, seeds/n_init, or evaluation space.'}}
    un=readcsv(ROOT/'data/interim/clustering_features_unimputed.csv').set_index('RID').loc[ids].drop(columns=['PTID'])
    im=readcsv(ROOT/'data/interim/clustering_features_imputed.csv').set_index('RID').loc[ids].drop(columns=['PTID'])
    med=un.median(); provenance['current']['medianImputationMaxAbsError']=float(np.abs(un.fillna(med).to_numpy()-im.to_numpy()).max())
    scaler=prep.set_index('variable').loc[un.columns]; reconstructed=(im.to_numpy()-scaler.scaler_mean_.to_numpy())/scaler.scaler_scale_.to_numpy()
    provenance['current']['standardizationMaxAbsError']=float(np.abs(reconstructed-X).max());save('metric_provenance.json',provenance)
    report(long,rep,metric,checks,nb,payload,hist,provenance)
    after=existing_state(); save('workspace_integrity_after.json',{'unchanged':before==after,'before':before,'after':after})
    assert before==after,'Existing workspace changes or Git index changed'
    save('source_manifest.json',{'sha256':sources})
    print('Verification artifacts and report written; existing changes and Git index unchanged.',flush=True)
def cite_and_hash(p): cite(p);return sources[relative(p)]
def fmt(v): return 'N/A' if v is None else f'{v:.12g}' if isinstance(v,float) else str(v)
def table(headers,rows): return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |',*['| '+' | '.join(fmt(v).replace('|','/').replace('\n',' ') for v in row)+' |' for row in rows]])
def report(long,rep,metric,checks,nb,payload,hist,prov):
    lines=['# Pipeline verification — October 12, 2026','',f"Branch: `{git('branch','--show-current').strip()}`; HEAD: `{git('rev-parse','HEAD').strip()}`.",'','Computed by `scripts/research/validation/verify_pipeline_oct12.py`. Only the two authorized longitudinal MixedLM fits were executed. All clustering metrics use stored matrices and stored assignments; no preprocessing/PCA/clustering/NbClust stage was run. JSON evidence is aggregate-only. Input SHA256s are in `docs/verification/source_manifest.json`; workspace preservation is in `workspace_integrity_after.json`.', '', '## 1. Standard DBI/CH provenance','',f"The authoritative current Standard mean DBI/CH is **{fmt(prov['current']['DBI'])} / {fmt(prov['current']['CH'])}**, recomputed from `data/interim/baseline_kmeans_assignments.csv` and `data/interim/clustering_features_standardized.csv`. It describes {prov['current']['participants']} participants, {prov['current']['featureCount']} variables, original standardized feature-space evaluation, seeds {min(prov['current']['seeds'])}–{max(prov['current']['seeds'])}, n_init={prov['current']['n_init']}. Cohort identity is the SHA256 of `data/interim/study_entry_cohort_unimputed.csv`: `{prov['current']['cohortSHA256']}`.",f"Retained variables: {', '.join(prov['current']['features'])}. Saved per-variable median imputation was independently checked against `clustering_features_unimputed.csv` and `clustering_features_imputed.csv` (maximum absolute discrepancy {fmt(prov['current']['medianImputationMaxAbsError'])}); recorded scaler reconstruction from `clustering_preprocessing_summary.csv` differs by at most {fmt(prov['current']['standardizationMaxAbsError'])}. Seeds and n_init are read from `baseline_kmeans_runs.csv`.",'',prov['earlier']['provenance'],f"Search covered {hist['searchedReachableCommits']} reachable commits across local refs and local docs/tests/artifacts. The older pair supplied in the task appears in historical `docs/INDEPENDENT_KMEANS_EXECUTION.md` only as an unresolved provenance note; no producing artifact was located. A 15-variable explanation is unsupported. See `docs/verification/provenance_search.json` for every matching path/commit. No remote fetch or unreachable-history search was performed.",'','## 2. Stored partition reproducibility','', 'Partition equivalence ignores cluster-label permutations; pairwise ARI excludes self-pairs. Exact counts are computed from canonical partitions, not rounded ARI. Sources: `data/interim/baseline_kmeans_assignments.csv`, `data/interim/dpc_comparison_random_assignments.csv`, and `'+rep['sources']['enhanced']+'`. The historical Enhanced NPZ lacks the newer assignment-hash payload field; its file SHA256 is recorded, and each repetition is compared directly to the authoritative assignment CSV.','',table(['Method','Runs','Pairwise ARI mean','min','max','Distinct partitions','Seed/run 0 incl. self','Excl. self','Modal exact'],[[n,d['executions'],d['pairwiseAriMean'],d['pairwiseAriMin'],d['pairwiseAriMax'],d['distinctPartitions'],f"{d['seed0ExactIncludingSelf']}/{d['executions']}",f"{d['seed0ExactExcludingSelf']}/{d['excludingSelfDenominator']}",f"{d['modalExact']}/{d['executions']}"] for n,d in rep.items() if n in ['standard','pcaRandom','enhanced']]),'',table(['Reference','Feature space','Self-match treatment','Computed count'],[['Standard seed 0','original standardized features','included',f"{rep['standard']['seed0ExactIncludingSelf']}/{rep['standard']['executions']}"],['Standard seed 0','original standardized features','excluded',f"{rep['standard']['seed0ExactExcludingSelf']}/{rep['standard']['excludingSelfDenominator']}"],['Enhanced DPC run 1 vs PCA+random','retained PCs','no self-match: different method',f"{rep['pcaRandomVersusEnhanced']['exactMatches']}/{rep['pcaRandom']['executions']}"]]),'','The historical PCA-random/DPC count and Standard reference count refer to different experiments; neither is inferred from the other. Modal agreement is independently calculated above.',f"Standard seed 0 versus Enhanced: ARI {fmt(rep['standardVersusEnhanced']['seed0']['ari'])}; aligned differing participants {rep['standardVersusEnhanced']['seed0']['alignedDifferenceCount']}. Across all stored Standard seeds: minimum ARI {fmt(rep['standardVersusEnhanced']['minARI'])}; exact matches {rep['standardVersusEnhanced']['exactMatches']}/{rep['standard']['executions']}. Every seed’s ARI and aligned mismatch count is in `docs/verification/reproducibility.json`.",'','## 3. Common-space metrics','','All statistics below are recomputed from the stored labels cited in item 2. Original-space matrix: `data/interim/clustering_features_standardized.csv`; PC matrix: `data/interim/clustering_pca_scores.csv`. SD is sample SD (ddof=1). Enhanced is evaluated once from its deterministic stored partition. Signed absolute differences are Enhanced minus Standard mean; they are not percentage improvements.']
    for space,entry in metric.items():
        lines+=['',f'### {space} ({entry["dimensions"]} dimensions)','',table(['Method','Metric','Mean/value','SD','Min','Max'],[[method,k,*[d[v] for v in ['mean','SD','min','max']]] for method,values in entry['conditions'].items() for k,d in values.items()]),'',table(['Metric','Enhanced minus Standard mean','Inside Standard seed range'],[[k,d['enhancedMinusStandardMean'],d['enhancedWithinStandardRange']] for k,d in entry['differences'].items()])]
    mismatches=[v for v in checks if v['mismatch']]
    lines+=['',f"User-supplied rounded comparison values: {len(mismatches)} mismatches of {len(checks)} checks, using half the last displayed decimal as tolerance. All raw differences and tolerances are in `docs/verification/common_space_metrics.json`.",'','## 4. Longitudinal reference and sensitivity','',f"Inputs: `{long['sources']['input']}` and `{long['sources']['assignments']}`. Model/data validation: `{long['sources']['implementation']}`. Stored reference: `{long['sources']['reference']}`. VISDATE-derived time, fixed original-cluster membership, and the existing eligibility rules are reused unchanged. Computed sample: {long['participants']} participants; {long['observations']} observations. Reference coefficient/SE/p-value maximum absolute error: {fmt(long['referenceMaxAbsoluteError'])}; match at 1e-8: {long['referenceMatchesAt1e8']}."]
    for name in ['randomIntercept','randomSlope']:
        d=long[name];lines+=['',f'### {name}', '',table(['Fixed effect','Estimate','SE','95% CI low','95% CI high','p'],[[k,v['estimate'],v['standardError'],*v['ci95'],v['pValue']] for k,v in d['fixedEffects'].items()]),f"ML; random formula `{d['randomFormula']}`; converged={d['converged']}; singular={d['singularFit']} under diagnostic eigenvalue criterion stated in JSON. Random variances: {', '.join(fmt(v) for v in d['randomVariances'])}; intercept–slope correlation: {fmt(d['randomCorrelation'])}; residual variance: {fmt(d['residualVariance'])}. Covariance eigenvalues: {', '.join(fmt(v) for v in d['covarianceEigenvalues'])}. Optimizer attempts/warnings: `{json.dumps(d['optimizerAttempts'])}`."]
    lines+=['',table(['Model','log likelihood','AIC','BIC'],[[n,long[n]['logLikelihood'],long[n]['AIC'],long[n]['BIC']] for n in ['randomIntercept','randomSlope']]),f"Likelihood-ratio statistic {fmt(long['likelihoodRatio']['statistic'])}; nominal df {long['likelihoodRatio']['nominalDegreesFreedom']}; nominal p {fmt(long['likelihoodRatio']['nominalChiSquareP'])}. {long['likelihoodRatio']['note']}",'']
    interaction=lambda name:next(v['estimate'] for k,v in long[name]['fixedEffects'].items() if ':' in k)
    lines += [f"Discrepancy note: On the same validated stored longitudinal cohort, the random-intercept ML model estimates the Time × Cluster interaction at {fmt(interaction('randomIntercept'))}, while allowing correlated participant-specific intercepts and time slopes estimates it at {fmt(interaction('randomSlope'))}. These correspond to the rounded values described in the task; the discrepancy arises under different random-effect specifications on the same fixed assignments and observations. The sensitivity model changes the covariance/weighting assumptions and is a separate analysis; it does not replace or revise the pre-specified random-intercept reference. Convergence and covariance diagnostics are reported above; the comparison does not establish that either specification should replace the reference.",'',f"Full-cohort Enhanced versus model assignment file: literal matches {rep['assignmentLinkage']['literalLabelMatches']}/{rep['assignmentLinkage']['fullCohort']['alignedMatchCount']+rep['assignmentLinkage']['fullCohort']['alignedDifferenceCount']}; ARI {fmt(rep['assignmentLinkage']['fullCohort']['ari'])}; all Enhanced repetitions match: {rep['assignmentLinkage']['allEnhancedRepetitionsMatchModel']}. This is the full parent assignment file actually joined by the model validator, before eligibility filtering.",'','## 5. Stored NbClust index ledger','','Source: `data/interim/clustering_nbclust_votes.csv`; seed/selection metadata: `data/interim/clustering_selected_k.csv`. No R or NbClust execution was performed.',table(['Index','Status','Voted k','Reason'],[[r['index'],r['status'],r['recommended_k'],r['reason']] for r in nb['indices']]),'',f"Computed status counts: `{json.dumps(nb['statusCounts'])}`; evaluated indices: {len(nb['indices'])}. Vote totals by k: `{json.dumps(nb['voteCounts'])}`. Stored selection metadata: `{json.dumps(nb['selectedArtifact'])}`. An empty failure ledger is evidence of no failed indices in this artifact, not a claim about other runs.",'','## 6. Standard Silhouette-by-k at completion','','Field: `result.standard.silhouetteByK` in `apps/api/private/method-runs/<job-id>/job.json`; corresponding `standard.silhouetteByK` in the sibling `result.json`. The Standard branch in `scripts/research/simulation/run_method.py` creates the series before writing `result.json`. `executeMethod` in `apps/api/src/services/methodExecution.ts` parses/validates the result and adds aggregate evidence, persists the result, then returns it. Only afterward does `drain` persist `job.json` with `status: complete` and that result. This establishes source-level write order plus stored-completion evidence, not a live race/timing replay.', '', table(['Stored complete job','Participants','k series','Present','Result equality'],[[r['jobSource'],r['participantCount'],','.join(map(str,r['kValues'])),r['presentAtStoredComplete'],r['jobResultEqualsResultFile']] for r in payload]),'','This is diagnosis only. No application code or job state was changed. Full per-job evidence is in `docs/verification/completion_payload.json`.','','## Discrepancies and unreproducible evidence','',table(['Finding','Evidence / limitation'],[['Earlier Standard DBI/CH pair','No producing artifact found; feature count, cohort, imputation, seeds/n_init and space undeterminable. Only an unresolved historical note was located.'],['Standard versus PCA-random reproducibility','Different reference partitions/spaces; included/excluded self-match counts computed above.'],['Native-space metric comparison','Original-feature Standard versus PC-space Enhanced is not a common-space comparison; use the two common-space tables.'],['Rounded metric mismatches',f'{len(mismatches)} flagged; raw comparisons retained in JSON.'],['Longitudinal discrepancy','Reference and sensitivity differ in random-effect specification; reference remains unchanged.'],['LRT calibration','Nominal chi-square p is descriptive; boundary-aware calibration not performed.'],['Singular diagnosis','Explicit minimum covariance eigenvalue diagnostic; no calibrated singular-fit package test.'],['Completion timing','Stored complete payload plus source write order checked; no live execution was replayed.'],['Historical provenance scope','Only locally reachable refs and available artifacts searched; no fetched or deleted/unreachable history.'],['Workspace','Existing changes, branch/HEAD and Git index compared before/after; see integrity JSON.']])]
    text=re.sub(r'\n{3,}','\n\n','\n\n'.join(lines))+'\n'
    text=text.replace('adds aggregate evidence, persists the result','records timing metadata, persists the result')
    if 'historicalNote' in prov['earlier']:
        e=prov['earlier'];c=prov['current']
        addition=table(['Pair','Variables','Cohort','Imputation','Seeds / n_init','Evaluation space'],[
            [f"{e['DBIText']} / {e['CHText']}",'undeterminable','undeterminable','undeterminable','undeterminable','undeterminable'],
            [f"{fmt(c['DBI'])} / {fmt(c['CH'])}",c['featureCount'],c['cohortSource'],'per-variable median',f"{min(c['seeds'])}–{max(c['seeds'])} / {c['n_init']}",c['evaluationSpace']]])
        addition+='\n\nEarlier pair text source: `'+e['historicalNote']+'`. Computed entry-phase counts for the analyzed matrix membership: `'+json.dumps(c['entryPhaseCounts'])+'`. The broader study-entry CSV contains '+str(c['sourceCohortRows'])+' rows, with full-file phase counts `'+json.dumps(c['fullSourcePhaseCounts'])+'`; the analyzed membership is '+str(c['participants'])+' rows after the scope restriction. Maximum absolute difference between those selected cohort features and the saved unimputed clustering matrix: '+fmt(c['sourceSelectedFeatureMaxAbsError'])+'. '+e['nearMatchExplanation']
        text=text.replace('## 2. Stored partition reproducibility',addition+'\n\n## 2. Stored partition reproducibility')
    cross=rep['standardVersusEnhanced']['perSeed']
    text=text.replace('## 3. Common-space metrics',table(['Standard seed vs Enhanced','ARI','Aligned differing participants'],[[v['seed'],v['ari'],v['alignedDifferenceCount']] for v in cross])+'\n\n## 3. Common-space metrics')
    if 'classificationCounts' in nb:
        counts=nb['classificationCounts']
        note=f"Computed confirmation: {len(nb['indices'])} evaluated = {counts.get('voted k',0)} voting + {counts.get('graphical/no vote',0)} graphical; {counts.get('failed',0)} failed."
        text=text.replace('Computed status counts:',note+'\n\nComputed status counts:')
        text=text.replace('| success |','| voted k |').replace('| unavailable |','| graphical/no vote |')
    text=text.replace('## 5. Stored NbClust index ledger','Reported p-values of zero are floating-point underflow, not literal zero probability. The nominal LRT log-p is '+fmt(long['likelihoodRatio'].get('nominalLogP'))+'; boundary-aware calibration remains unavailable.\n\n## 5. Stored NbClust index ledger')
    (ROOT/'docs/PIPELINE_VERIFICATION_OCT12.md').write_text(text,encoding='utf-8')
def render_saved():
    before=existing_state()
    sources.update(json.loads((OUT/'source_manifest.json').read_text())['sha256'])
    long=readjson(OUT/'longitudinal.json');rep=readjson(OUT/'reproducibility.json')
    long['likelihoodRatio']['note']=long['likelihoodRatio']['note'].replace('slope/intercept covariance is unidentified','intercept–slope correlation is unidentified')
    metrics=readjson(OUT/'common_space_metrics.json');nb=readjson(OUT/'nbclust.json')
    for check in metrics['comparisonChecks']:
        check['roundingTolerance']=.5*10**(-(6 if check['metric']=='calinski_harabasz' else 9))
        check['mismatch']=abs(check['difference'])>check['roundingTolerance']
    save('common_space_metrics.json',metrics)
    payload=readjson(OUT/'completion_payload.json')['jobs'];hist=readjson(OUT/'provenance_search.json');prov=readjson(OUT/'metric_provenance.json')
    # Numeric values of the unresolved pair are extracted from the historical note.
    hit=next(v for v in hist['historicalMatches'] if v['path']=='docs/INDEPENDENT_KMEANS_EXECUTION.md' and '1.22567' in v['occurrences'])
    blob=git('show',hit['commit']+':'+hit['path'])
    prov['earlier'].update(DBIText=re.search(r'1\.22567\d+',blob).group(),CHText=re.search(r'1443\.226\d+',blob).group(),historicalNote=hit['commit']+':'+hit['path'])
    # Broad-prefix search located an unrelated simulation mean; verify and disclose it.
    near=ROOT/'apps/api/private/simulation-runs/simulation-1-00229fed-bc14-41e7-a357-b6698fec96b3/data/interim/baseline_kmeans_summary.csv'
    nearstats=readcsv(near).set_index('metric')
    prov['earlier']['nearMatchExplanation']=f"Broad-prefix search also found an unrelated simulation Standard DBI {fmt(float(nearstats.loc['davies_bouldin','mean']))} with CH {fmt(float(nearstats.loc['calinski_harabasz','mean']))} in `{relative(near)}`. This is not the earlier pair and does not identify its provenance."
    cohort=readcsv(ROOT/'data/interim/study_entry_cohort_unimputed.csv')
    features=readcsv(ROOT/'data/interim/clustering_features_unimputed.csv')
    selected_cohort=cohort.set_index('RID').loc[features.RID]
    prov['current']['entryPhaseCounts']={str(k):int(v) for k,v in selected_cohort.ENTRY_PHASE.value_counts().items()}
    prov['current']['fullSourcePhaseCounts']={str(k):int(v) for k,v in cohort.ENTRY_PHASE.value_counts().items()}
    prov['current']['sourceCohortRows']=len(cohort)
    columns=prov['current']['features']
    a=features[columns].to_numpy(float);b=selected_cohort[columns].to_numpy(float)
    assert np.array_equal(np.isnan(a),np.isnan(b))
    prov['current']['sourceSelectedFeatureMaxAbsError']=float(np.nanmax(np.abs(a-b)))
    stored=readcsv(ROOT/'data/interim/baseline_kmeans_runs.csv')
    prov['current']['storedRunMetricMeanErrors']={k:metrics['spaces']['13D']['conditions']['standard'][k]['mean']-float(stored[k].mean()) for k in KEYS}
    original=readjson(SNAP/'data/interim/unified_longitudinal_mixed_model.json')
    mapping={'intercept':'Intercept','cluster':'original_cluster[T.1]','time':'time_years','time_x_cluster':'time_years:original_cluster[T.1]'}
    long['referenceConfidenceIntervalErrors']={r['term']:[long['randomIntercept']['fixedEffects'][mapping[r['term']]]['ci95'][i]-r['confidenceInterval95'][k] for i,k in enumerate(['lower','upper'])] for r in original['fixedEffects']}
    lr=long['likelihoodRatio'];lr['nominalLogP']=float(-lr['statistic']/2) if lr['nominalDegreesFreedom']==2 else float(chi2.logsf(lr['statistic'],lr['nominalDegreesFreedom']))
    vote_counts=Counter(str(int(float(v['recommended_k']))) for v in nb['indices'] if str(v['recommended_k'])!='')
    selected=nb['selectedArtifact'][0]
    nb['voteCounts']={str(k):vote_counts.get(str(k),0) for k in range(int(selected['candidate_k_min']),int(selected['candidate_k_max'])+1)}
    for r in nb['indices']:
        r['classification']='voted k' if str(r['recommended_k'])!='' else 'graphical/no vote' if 'graphical' in r['reason'] else 'failed'
    nb['classificationCounts']=dict(Counter(r['classification'] for r in nb['indices']))
    nb['expectedLedgerConfirmed']=len(nb['indices'])==sum(nb['classificationCounts'].values()) and nb['classificationCounts'].get('failed',0)==0 and sum(nb['voteCounts'].values())==nb['classificationCounts']['voted k']
    summary=readcsv(ROOT/'data/interim/clustering_nbclust_summary.csv')
    nb['storedVoteSummaryMatches']=all(nb['voteCounts'][str(int(r.k))]==int(r.vote_count) for r in summary.itertuples())
    assert nb['storedVoteSummaryMatches']
    # Cite the inspected completion implementation and compute its actual line numbers.
    write_order={}
    for p,needles in [(ROOT/'scripts/research/simulation/run_method.py',["'silhouetteByK':", "write_json(workspace/'result.json', result)"]), (ROOT/'apps/api/src/services/methodExecution.ts',['status: "complete", stage: "complete", result','const result = MethodResultSchema.parse(JSON.parse','atomic(path.join(directory, "result.json"), result);'])]:
        cite(p);rows=p.read_text().splitlines();write_order[relative(p)]={needle:[i+1 for i,row in enumerate(rows) if needle in row] for needle in needles}
    completion=readjson(OUT/'completion_payload.json');completion['sourceLineEvidence']=write_order
    completion['sourceOrder']=[s.replace('evidence-enriched','timing-enriched') for s in completion['sourceOrder']]
    for name,d in [('longitudinal.json',long),('nbclust.json',nb),('metric_provenance.json',prov),('completion_payload.json',completion)]:save(name,d)
    report(long,rep,metrics['spaces'],metrics['comparisonChecks'],nb,payload,hist,prov)
    # Do not include generated JSONs as immutable source artifacts (self-reference).
    immutable={k:v for k,v in sources.items() if not k.startswith('docs/verification/')}
    save('source_manifest.json',{'sha256':immutable})
    assert before==existing_state()
    save('report_checks.json',{'existingWorkspaceUnchanged':True,'metricComparisonMismatches':sum(v['mismatch'] for v in metrics['comparisonChecks']),'referenceCIsMatch':all(abs(v)<1e-8 for row in long['referenceConfidenceIntervalErrors'].values() for v in row),'completePayloadsHaveFullSeries':all(v['kValues']==list(range(2,11)) and v['jobResultEqualsResultFile'] for v in payload),'nbclustLedgerConfirmed':nb['expectedLedgerConfirmed'],'storedVoteSummaryMatches':nb['storedVoteSummaryMatches']})
    print('Saved evidence report rendered and cross-checked; no fits executed.',flush=True)
if __name__=='__main__':
    if '--report' in sys.argv:render_saved()
    else:main()
