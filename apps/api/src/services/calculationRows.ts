import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { MethodJob } from "../../../../packages/shared/src/methodExecution";
import { resolvePython, buildResearchEnvironment } from "./researchPipelineOrchestrator";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const hash = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pending = new Map<string, Promise<void>>();
type Sidecar = { sources: Record<string, string>; matrixSources: Record<string, string>; variants: Record<string, { rows: { rid: string; cluster: number; a: number; b: number; s: number }[]; validation: { count: number; meanError: number; sklearnMaxError: number } }> };
export async function calculationSidecar(job: MethodJob, directory: string): Promise<Sidecar | undefined> {
  if (job.status !== "complete" || !job.result || !/^[a-f0-9-]{36}$/.test(job.id)) return;
  const folder = path.join(directory, job.id), file = path.join(folder, "participant-calculations.json");
  if (!["request.json", "partitions.npz", "result.json"].every(name => fs.existsSync(path.join(folder, name)))) return;
  const read = () => {
    if (hash(file) !== fs.readFileSync(path.join(folder, "participant-calculations.sha256"), "utf8").trim()) throw new Error("Calculation sidecar checksum mismatch.");
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as Sidecar;
    if (Object.entries(data.sources).some(([name, expected]) => !["request.json", "result.json", "partitions.npz"].includes(name) || hash(path.join(folder, name)) !== expected) ||
      Object.entries(data.matrixSources).some(([name, expected]) => hash(name) !== expected) ||
      Object.values(data.variants).some(v => v.validation.meanError > 1e-9 || v.validation.sklearnMaxError > 1e-9 || v.rows.length !== v.validation.count)) throw new Error("Calculation sidecar changed.");
    return data;
  };
  try { return read(); } catch { /* Derive from verified saved sources, never fit. */ }
  if (!pending.has(folder)) pending.set(folder, new Promise<void>((resolve, reject) => execFile(resolvePython(), ["-B", path.join(root, "scripts/research/validation/derive_calculation_rows.py"), folder],
    { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024, env: { ...buildResearchEnvironment(), PYTHONDONTWRITEBYTECODE: "1", OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" } },
    error => error ? reject(new Error("Stored participant calculation validation failed.")) : resolve())).finally(() => pending.delete(folder)));
  await pending.get(folder);
  return read();
}
export async function withCalculationRows(job: MethodJob, directory: string): Promise<MethodJob> {
  if (process.env.NODE_ENV === "production") return job;
  let data: Sidecar | undefined;
  try { data = await calculationSidecar(job, directory); } catch { return job; }
  if (!data || !job.result) return job;
  const result = structuredClone(job.result);
  const attach = (calculation: NonNullable<typeof result.calculation>, variant: string) => {
    if (data.variants[variant]) calculation.participantSidecar = { url: `/api/method-runs/${job.id}/calculations/${variant}`, sha256: hash(path.join(directory, job.id, "participant-calculations.json")), count: data.variants[variant].validation.count };
  };
  if (result.calculation) attach(result.calculation, "native");
  for (const space of result.commonSpace?.spaces ?? []) for (const condition of ["standard", "pcaRandom", "enhanced"] as const) attach(space.conditions[condition].calculation, `${space.space}_${condition}`);
  return { ...job, result };
}
