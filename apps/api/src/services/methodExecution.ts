import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MethodJobSchema, MethodRequestSchema, MethodResultSchema, compatibleMethods, type MethodJob, type MethodRequest } from "../../../../packages/shared/src/methodExecution";
import { resolveUploadDirectory } from "./localUploadStore";
import { analysisInputManifest, validateAnalysisInputManifest } from "./analysisInputManifest";
import { getSimulationSample } from "./simulationSample";
import { loadSimulationCohort, simulationCohortRoot, sha256 } from "./simulationCohort";
import { buildResearchEnvironment, resolvePython } from "./researchPipelineOrchestrator";
import { materializeCanonicalResearchSources, canonicalizeResearchPythonSource, verifyCanonicalDpcSource } from "./researchSourceMaterializer";
import { withResearchCapacity } from "./researchExecutionCapacity";
import { findReusableCohort } from "./cohortReuse";
import { StudyPreparationStore, preparationIdentity, preparationKey, type PreparedStudy } from './studyPreparation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const methodRoot = path.join(root, "apps/api/private/method-runs");
const atomic = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temp, file);
};
const inputKey = (input: MethodRequest["input"]) => JSON.stringify(input);
const active = (job: MethodJob) => job.status === "running" || job.status === "queued";
type Execute = (job: MethodJob, directory: string, signal: AbortSignal, stage: (value: string) => void) => Promise<unknown>;

/** Serialized admission with immutable completions. New request IDs are true
 * reruns; idempotent retry uses the SAME ID. Failed/running jobs never replace
 * a previous successful result. Only the new process's jobs are recoverable. */
export class MethodExecutor {
  private queue: string[] = [];
  private controller: AbortController | null = null;
  private current: string | null = null;
  private draining = false;
  constructor(readonly directory = methodRoot, private execute: Execute = executeMethod, private snapshot = true) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory)) {
      if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
      const job = this.get(entry);
      if (job && active(job)) this.save({ ...job, status: "failed", stage: "interrupted", finishedAt: new Date().toISOString(),
        error: "Execution interrupted by an API restart. Retry this method; completed results remain available." });
    }
  }
  private save(job: MethodJob) { atomic(path.join(this.directory, job.id, "job.json"), MethodJobSchema.parse(job)); }
  get(id: string): MethodJob | null {
    if (!/^[a-f0-9-]{36}$/.test(id)) return null;
    try {
      const job = MethodJobSchema.parse(JSON.parse(fs.readFileSync(path.join(this.directory, id, "job.json"), "utf8")));
      if (job.status === "running" && job.startedAt) job.elapsedSeconds = (Date.now() - Date.parse(job.startedAt)) / 1000;
      return job;
    } catch { return null; }
  }
  start(payload: unknown): MethodJob {
    const receivedAt = Date.now();
    const request = MethodRequestSchema.parse(payload);
    const existing = this.get(request.requestId);
    if (existing) {
      if (existing.method !== request.method || inputKey(existing.input) !== inputKey(request.input) ||
        existing.standardId !== request.standardId || existing.enhancedId !== request.enhancedId) throw new Error("Request identity conflict.");
      return existing;
    }
    for (const id of [...this.queue, ...(this.current ? [this.current] : [])]) {
      const running = this.get(id);
      if (running && active(running) && running.method === request.method && inputKey(running.input) === inputKey(request.input) &&
        running.standardId === request.standardId && running.enhancedId === request.enhancedId) return running;
    }
    if (this.queue.length >= 4) throw new Error("Method execution queue is full.");
    if (request.method === "comparison") {
      const standard = this.get(request.standardId ?? ""), enhanced = this.get(request.enhancedId ?? "");
      if (standard?.status !== "complete" || enhanced?.status !== "complete" || !compatibleMethods(standard.result, enhanced.result) ||
        inputKey(standard.input) !== inputKey(request.input) || inputKey(enhanced.input) !== inputKey(request.input)) throw new Error("Comparison requires compatible completed methods.");
    }
    const directory = path.join(this.directory, request.requestId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (this.snapshot && request.input.scope === "study" && request.method !== "comparison") {
      new StudyPreparationStore(this.directory).requireReady(request.input.uploadRef);
      const upload = resolveUploadDirectory(request.input.uploadRef);
      const snapshots = path.join(this.directory, "inputs", request.input.uploadRef);
      if (fs.existsSync(upload)) {
        validateAnalysisInputManifest(upload);
        fs.mkdirSync(snapshots, { recursive: true });
        for (const { filename } of analysisInputManifest) {
          const bytes = fs.readFileSync(path.join(upload, filename));
          const target = path.join(snapshots, filename);
          if (fs.existsSync(target) && sha256(fs.readFileSync(target)) !== sha256(bytes)) throw new Error("Validated upload changed.");
          if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { mode: 0o600 });
        }
      }
      validateAnalysisInputManifest(snapshots);
    }
    const job = MethodJobSchema.parse({ id: request.requestId, method: request.method, input: request.input,
      standardId: request.standardId, enhancedId: request.enhancedId,
      status: "queued", stage: "queued", createdAt: new Date(receivedAt).toISOString(), admissionSeconds: (Date.now()-receivedAt)/1000,
      startedAt: null, finishedAt: null, elapsedSeconds: 0, error: null, result: null });
    this.save(job);
    this.queue.push(job.id);
    queueMicrotask(() => void this.drain());
    return job;
  }
  cancel(id: string) {
    const job = this.get(id);
    if (!job || !active(job)) return job;
    if (this.current === id) this.controller?.abort();
    this.save({ ...job, status: "cancelled", stage: "cancelled", finishedAt: new Date().toISOString(), error: null });
    return this.get(id);
  }
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        let job = this.get(id)!;
        if (job.status === "cancelled") continue;
        this.current = id;
        this.controller = new AbortController();
        job = { ...job, status: "running", startedAt: new Date().toISOString(), stage: "preparing_inputs" };
        this.save(job);
        try {
          this.save({ ...job, stage: "waiting_capacity" });
          const result = MethodResultSchema.parse(await withResearchCapacity(() => this.execute(job, path.join(this.directory, id), this.controller!.signal, stage => {
            const latest = this.get(id)!;
            if (latest.status === "running") this.save({ ...latest, stage });
          }), this.controller.signal));
          if (this.controller.signal.aborted) continue;
          if (result.method !== job.method) throw new Error("Method result identity mismatch.");
          this.save({ ...this.get(id)!, status: "complete", stage: "complete", result, finishedAt: new Date().toISOString() });
        } catch (error) {
          if (!this.controller.signal.aborted) {
            fs.appendFileSync(path.join(this.directory, id, "execution.log"), `\n${error instanceof Error ? error.stack : "Execution failed"}\n`);
            this.save({ ...this.get(id)!, status: "failed", stage: "failed", finishedAt: new Date().toISOString(),
              error: "Method execution failed. Inspect its private execution log, then retry this method." });
          }
        } finally { this.current = null; this.controller = null; }
      }
    } finally { this.draining = false; }
  }
}

const implementationHash = () => {
  const parts: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "legacy" || entry.name === "__pycache__") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name.endsWith(".py")) parts.push(`${path.relative(root, file)}:${sha256(canonicalizeResearchPythonSource(fs.readFileSync(file)))}`);
    }
  };
  visit(path.join(root, "scripts/research"));
  for (const file of ["apps/api/src/services/methodExecution.ts", "packages/shared/src/methodExecution.ts",
    "apps/api/src/services/cohortReuse.ts",
    "apps/api/src/services/studyPreparation.ts", "packages/shared/src/studyPreparation.ts",
    "apps/api/src/services/researchExecutionCapacity.ts", "apps/api/src/services/researchSourceMaterializer.ts",
    "apps/api/src/services/simulationSample.ts", "apps/api/src/services/analysisInputManifest.ts"])
    parts.push(sha256(fs.readFileSync(path.join(root, file))));
  return sha256(parts.join("\n"));
};

async function executeMethod(job: MethodJob, directory: string, signal: AbortSignal, stage: (value: string) => void, prepareOnly = false) {
  const started = Date.now();
  const overhead: Record<string, number> = {};
  overhead.admission_and_snapshot = job.admissionSeconds ?? 0;
  overhead.queue_and_capacity_wait = Math.max(0, (started-Date.parse(job.createdAt))/1000-overhead.admission_and_snapshot);
  let checkpoint = started;
  const mark = (name: string) => { const now = Date.now(); overhead[name] = (now-checkpoint)/1000; checkpoint = now; };
  stage("preparing_inputs");
  const environment: NodeJS.ProcessEnv = { ...buildResearchEnvironment(), PYTHONDONTWRITEBYTECODE: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" };
  const python = resolvePython();
  const dependencies = spawnSync(python, ["-B", "-c", "import sys,json,importlib.metadata as m; print(json.dumps([sys.version,[(x,m.version(x)) for x in ['numpy','scipy','scikit-learn','pandas','rpy2-rinterface']]]))"],
    { env: environment, encoding: "utf8", windowsHide: true, timeout: 30000 });
  if (dependencies.status !== 0) throw new Error("Unable to fingerprint the research environment.");
  const rHome = environment.R_HOME;
  const rFiles = rHome ? [path.join(rHome, "library/NbClust/DESCRIPTION"), path.join(rHome, "library/base/DESCRIPTION")]
    .filter(file => fs.existsSync(file)).map(file => sha256(fs.readFileSync(file))) : [];
  const r = rHome ? spawnSync(path.join(rHome, "bin", process.platform === "win32" ? "Rscript.exe" : "Rscript"), ["-e",
    'cat(R.version.string); for (p in c("NbClust", "cluster", "stats")) { cat(p, as.character(packageVersion(p)), tools::md5sum(file.path(find.package(p), "DESCRIPTION")), sep="|") }'],
    { env: environment, encoding: "utf8", windowsHide: true, timeout: 15000 }) : null;
  const dependencyHash = sha256(JSON.stringify([dependencies.stdout.trim(), rHome, rFiles, r?.status, r?.stdout, environment.R_LIBS, environment.R_LIBS_USER]));
  const codeHash = implementationHash();
  verifyCanonicalDpcSource(path.join(root, "scripts/research"));
  mark("environment_and_code_checks");
  const run = (script: string, args: string[], cwd = directory) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error("Cancelled")); return; }
    const log = fs.openSync(path.join(directory, "execution.log"), "a");
    const child = spawn(python, ["-B", script, ...args], { cwd, env: environment, windowsHide: true, shell: false, stdio: ["ignore", "pipe", log] });
    let buffer = "";
    child.stdout!.on("data", (bytes: Buffer) => {
      fs.writeSync(log, bytes); buffer += bytes.toString();
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
      for (const line of lines) { try { const event = JSON.parse(line); if (typeof event.stage === "string") stage(event.stage); } catch { /* private diagnostics */ } }
    });
    let timeout = false;
    const abort = () => child.kill();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timeout = true; child.kill(); }, 60 * 60 * 1000);
    child.once("error", reject);
    child.once("close", code => {
      clearTimeout(timer); signal.removeEventListener("abort", abort); fs.closeSync(log);
      if (code === 0 && !signal.aborted && !timeout) resolve(); else reject(new Error(timeout ? "Method timed out" : "Research process failed or cancelled"));
    });
  });
  let sourcePath: string, sourceHash: string, ids: string[] | undefined;
  let prepared: PreparedStudy | undefined;
  let sharedPreparationKey: string | undefined;
  if (job.input.scope === "simulation") {
    const cohort = loadSimulationCohort();
    sourcePath = process.env.SIMULATION_COHORT_SOURCE ? path.resolve(root, process.env.SIMULATION_COHORT_SOURCE) : path.join(simulationCohortRoot, "study_entry_cohort_unimputed.csv");
    sourceHash = sha256(fs.readFileSync(sourcePath));
    if (sourceHash !== cohort.provenance.source.sha256) throw new Error("Cohort integrity failure.");
    ids = getSimulationSample(job.input.simulationId, job.input.configuration).sampleParticipantIds;
  } else if (!prepareOnly) {
    prepared = new StudyPreparationStore(path.dirname(directory)).requireReady(job.input.uploadRef);
    if (prepared.state.dependenciesHash !== dependencyHash) {
      new StudyPreparationStore(path.dirname(directory)).invalidate(job.input.uploadRef);
      throw new Error('Research dependencies changed. Prepare the dataset again.');
    }
    sourcePath=prepared.sourcePath;sourceHash=prepared.state.sourceHash!;sharedPreparationKey=prepared.state.key;
    overhead.cohort_cache_hit=1;
    mark('prepared_cohort_verification');
  } else {
    const inputDirectory = path.join(path.dirname(directory), "inputs", job.input.uploadRef);
    validateAnalysisInputManifest(inputDirectory);
    const inputHash = sha256(JSON.stringify(analysisInputManifest.map(({ filename }) => [filename, sha256(fs.readFileSync(path.join(inputDirectory, filename)))])));
    sharedPreparationKey=preparationKey(preparationIdentity(inputDirectory),dependencyHash);
    // Downstream comparison/UI changes cannot change cohort construction.
    // Hash the complete study-entry source directory (including helper modules).
    const cohortCode = fs.readdirSync(path.join(root, "scripts/research/study_entry")).filter(name => name.endsWith(".py")).sort()
      .map(name => [name, sha256(canonicalizeResearchPythonSource(fs.readFileSync(path.join(root, "scripts/research/study_entry", name))))]);
    const cohortKey = sha256(JSON.stringify([inputHash, cohortCode, dependencyHash]));
    let cohortDirectory = path.join(path.dirname(directory), "cohorts", cohortKey);
    // Reuse a prior verified cohort across downstream-only code changes.
    // Recheck raw bytes, construction source bytes, environment and output hash.
    if (!fs.existsSync(path.join(cohortDirectory, "source.json"))) {
      cohortDirectory = findReusableCohort(path.dirname(directory), dependencyHash, inputHash, cohortCode,
        analysisInputManifest.map(row=>row.filename)) ?? cohortDirectory;
    }
    sourcePath = path.join(cohortDirectory, "data/interim/study_entry_cohort_unimputed.csv");
    const manifestFile = path.join(cohortDirectory, "source.json");
    let verified = false;
    try { verified = JSON.parse(fs.readFileSync(manifestFile, "utf8")).sha256 === sha256(fs.readFileSync(sourcePath)); } catch { /* build */ }
    mark("input_validation_and_cache_lookup");
    if (!verified) {
      stage("constructing_study_entry_cohort");
      materializeCanonicalResearchSources(path.join(root, "scripts/research"), path.join(cohortDirectory, "scripts/research"));
      const raw = path.join(cohortDirectory, "data/raw/adni");
      fs.mkdirSync(raw, { recursive: true });
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.mkdirSync(path.join(cohortDirectory, "data/processed"), { recursive: true });
      for (const { filename } of analysisInputManifest) fs.copyFileSync(path.join(inputDirectory, filename), path.join(raw, filename));
      mark("cohort_materialization");
      for (const filename of ["audit_adni_inputs.py", "audit_candidate_mapping.py", "reconcile_variable_dictionary.py", "construct_study_entry_cohort.py", "audit_study_entry_scope_npiq.py"]) {
        await run(path.join(cohortDirectory, "scripts/research/study_entry", filename), [], cohortDirectory);
        mark(`cohort_${filename.replace(/\.py$/, "")}`);
      }
      atomic(manifestFile, { sha256: sha256(fs.readFileSync(sourcePath)) });
    }
    sourceHash = sha256(fs.readFileSync(sourcePath));
    overhead.cohort_cache_hit = verified ? 1 : 0;
  }
  const compatibilityKey = sha256(JSON.stringify([sourceHash, ids ?? null, job.input.scope, codeHash, dependencyHash]));
  const verifiedResult = (id: string | undefined) => {
    if (!id) return undefined;
    const folder=path.join(path.dirname(directory),id);
    const saved=MethodJobSchema.parse(JSON.parse(fs.readFileSync(path.join(folder,"job.json"),"utf8")));
    const bytes=fs.readFileSync(path.join(folder,"result.json"));
    const result=MethodResultSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (saved.status!=="complete" || JSON.stringify(saved.result)!==JSON.stringify(result)) throw new Error("Completed result artifact changed.");
    return sha256(bytes);
  };
  const request = { isolatedMethod: true, method: prepareOnly ? 'preparation' : job.method, scope: job.input.scope, sourcePath, sourceHash, participantIds: ids,
    manualK: job.input.scope === "simulation" ? job.input.configuration.manualK : null,
    compatibilityKey, implementationHash: codeHash, dependenciesHash: dependencyHash,
    preparationKey: sharedPreparationKey, datasetHash: prepared?.state.sourceFilesHash, requirePrepared:!!prepared,
    cacheDirectory: prepared?.cacheDirectory ?? path.join(path.dirname(directory), "preprocessing"),
    standardResultHash: verifiedResult(job.standardId), enhancedResultHash: verifiedResult(job.enhancedId),
    standardResult: job.standardId ? path.join(path.dirname(directory), job.standardId, "result.json") : undefined,
    enhancedResult: job.enhancedId ? path.join(path.dirname(directory), job.enhancedId, "result.json") : undefined };
  atomic(path.join(directory, "request.json"), request);
  atomic(path.join(directory, "environment.json"), { dependencies: dependencies.stdout.trim(), rHome, rFiles, rPackages: r?.stdout, implementationHash: codeHash });
  mark("worker_input_preparation");
  await run(path.join(root, "scripts/research/simulation/run_method.py"), [directory]);
  if (codeHash !== implementationHash()) throw new Error("Implementation changed during execution.");
  if (prepareOnly) {
    const evidence=JSON.parse(fs.readFileSync(path.join(directory,'prepared.json'),'utf8'));
    const identity=preparationIdentity(path.join(path.dirname(directory),'inputs',(job.input as {uploadRef:string}).uploadRef));
    return {sourcePath,cacheDirectory:request.cacheDirectory,state:{status:'ready',stage:'ready',error:null,...identity,
      key:sharedPreparationKey,dependenciesHash:dependencyHash,sourceHash,preprocessingHash:evidence.preprocessingHash,pcaHash:evidence.pcaHash,
      participantCount:evidence.participantCount,retainedVariables:evidence.retainedVariables,
      cacheHit:overhead.cohort_cache_hit===1&&evidence.cacheHits.preprocessing&&evidence.cacheHits.pca,
      timings:{...overhead,...evidence.timings,wall:(Date.now()-started)/1000}}} as PreparedStudy;
  }
  const result = MethodResultSchema.parse(JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8")));
  if (result.provenance.compatibilityKey !== compatibilityKey) throw new Error("Result provenance mismatch.");
  result.timings.wall = (Date.now() - started) / 1000;
  mark("worker_and_result_validation");
  overhead.worker_startup_and_transport = Math.max(0, overhead.worker_and_result_validation - result.timings.total);
  Object.assign(result.timings, overhead);
  atomic(path.join(directory, "result.json"), result);
  mark("result_persistence");
  result.timings.result_persistence = overhead.result_persistence;
  result.timings.wall = (Date.now()-started)/1000;
  result.timings.application_wall = (Date.now()-Date.parse(job.createdAt))/1000;
  atomic(path.join(directory, "result.json"), result);
  return result;
}
export const methodExecutor = new MethodExecutor();
export async function executeStudyPreparation(uploadRef:string, directory:string, stage:(name:string)=>void):Promise<PreparedStudy> {
  const job=MethodJobSchema.parse({id:path.basename(directory),method:'standard',input:{scope:'study',uploadRef},
    status:'running',stage:'preparing_inputs',createdAt:new Date().toISOString(),startedAt:new Date().toISOString(),finishedAt:null,
    elapsedSeconds:0,error:null,result:null});
  return await executeMethod(job,directory,new AbortController().signal,stage,true) as PreparedStudy;
}
