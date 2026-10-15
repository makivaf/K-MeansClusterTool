import path from "node:path";
import { execFile } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { InitializationEvidenceSchema } from "../../../../packages/shared/src/partitionEvidence";
import type { MethodJob } from "../../../../packages/shared/src/methodExecution";
import { resolvePython, buildResearchEnvironment } from "./researchPipelineOrchestrator";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cache = new Map<string, ReturnType<typeof InitializationEvidenceSchema.parse>>();
// Enrich only the API response. Immutable completed job/result files stay intact.
export async function withPartitionEvidence(job: MethodJob, directory: string): Promise<MethodJob> {
  if (!job.result?.assignmentsHash || job.status !== "complete") return job;
  const fingerprint = () => {
    const hash = crypto.createHash("sha256");
    for (const id of [job.id, ...(job.method === "comparison" ? [job.standardId!, job.enhancedId!] : [])]) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid evidence source identity.");
      for (const name of ["job.json", "result.json", "partitions.npz"]) hash.update(fs.readFileSync(path.join(directory, id, name)));
    }
    if (job.input.scope === "study") for (const name of ["enhanced-30-report.json", "enhanced-30-partitions.npz"]) {
      const file = path.join(root, "apps/api/private/final-ui-evidence", name);
      if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
    }
    return hash.digest("hex");
  };
  const key = fingerprint();
  let initializationEvidence = cache.get(key);
  if (!initializationEvidence) {
    const stdout = await new Promise<string>((resolve, reject) => execFile(resolvePython(), ["-B", path.join(root, "scripts/research/validation/derive_partition_evidence.py"), path.join(directory, job.id), ...(job.input.scope === "study" ? ["--final-ui"] : [])],
      { windowsHide: true, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
        env: { ...buildResearchEnvironment(), OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" } },
      (error, output) => error ? reject(new Error("Saved partition evidence failed provenance or completeness validation.")) : resolve(output)));
    if (fingerprint() !== key) throw new Error("Evidence artifacts changed during derivation.");
    initializationEvidence = InitializationEvidenceSchema.parse(JSON.parse(stdout));
    if (cache.size >= 32) cache.clear();
    cache.set(key, initializationEvidence);
  }
  return { ...job, result: { ...job.result, initializationEvidence } };
}
