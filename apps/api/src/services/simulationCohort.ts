import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readCsvRecords } from "./artifactReaders";
import { analysisInputManifest } from "./analysisInputManifest";

export const simulationCohortRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../private/simulation-cohort");
export const cohortSourceFilename = "study_entry_cohort_unimputed.csv";
export const phaseCounts = { ADNI1: 819, ADNIGO: 130, ADNI2: 789, ADNI3: 699 } as const;
const phaseSchema = z.enum(["ADNI1", "ADNIGO", "ADNI2", "ADNI3"]);
const participantSchema = z.object({ RID: z.string().regex(/^[1-9]\d*$/), ENTRY_PHASE: phaseSchema }).strict();
export type SimulationCohortParticipant = z.infer<typeof participantSchema>;
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const cohortConstructionScripts = [
  "audit_adni_inputs.py", "audit_candidate_mapping.py", "reconcile_variable_dictionary.py", "construct_study_entry_cohort.py"
] as const;
const provenanceSchema = z.object({
  version: z.literal(1),
  publishedAt: z.string().datetime(),
  source: z.object({
    filename: z.literal("study_entry_cohort_unimputed.csv"),
    sha256: digestSchema,
    constructionId: z.string().uuid(),
    inputs: z.array(z.object({ filename: z.string().min(1), sha256: digestSchema }).strict()).length(7)
      .refine((entries) => entries.every((entry, index) => entry.filename === analysisInputManifest[index].filename)),
    scripts: z.array(z.object({ filename: z.string().min(1), sha256: digestSchema }).strict()).length(4)
      .refine((entries) => entries.every((entry, index) => entry.filename === cohortConstructionScripts[index]))
  }).strict(),
  rosterSha256: digestSchema,
  participantCount: z.literal(2437),
  phaseCounts: z.object({ ADNI1: z.literal(819), ADNIGO: z.literal(130), ADNI2: z.literal(789), ADNI3: z.literal(699) }).strict()
}).strict();
export type SimulationCohortProvenance = z.infer<typeof provenanceSchema>;
export const sha256 = (bytes: crypto.BinaryLike): string => crypto.createHash("sha256").update(bytes).digest("hex");

export function validateSimulationRoster(value: unknown): SimulationCohortParticipant[] {
  const rows = z.array(participantSchema).length(2437).parse(value);
  if (new Set(rows.map((row) => row.RID)).size !== rows.length) throw new Error("Duplicate cohort RID.");
  for (const [phase, expected] of Object.entries(phaseCounts)) {
    if (rows.filter((row) => row.ENTRY_PHASE === phase).length !== expected) throw new Error("Invalid cohort phase counts.");
  }
  return rows.sort((left, right) => left.RID.length - right.RID.length || (left.RID < right.RID ? -1 : left.RID > right.RID ? 1 : 0));
}

/** Internal only. No HTTP route exposes this participant-level artifact. */
export function loadSimulationCohort(directory = simulationCohortRoot) {
  const provenance = provenanceSchema.parse(JSON.parse(fs.readFileSync(path.join(directory, "provenance.json"), "utf8")));
  const bytes = fs.readFileSync(path.join(directory, "roster.json"));
  if (sha256(bytes) !== provenance.rosterSha256) throw new Error("Simulation cohort integrity check failed.");
  const participants = validateSimulationRoster(JSON.parse(bytes.toString("utf8")));
  return { participants, provenance };
}

/** Publication boundary for output freshly produced by the dedicated constructor command. */
export function publishSimulationCohort(
  sourceDirectory: string,
  construction: Omit<SimulationCohortProvenance["source"], "filename" | "sha256">,
  directory = simulationCohortRoot
) {
  const sourcePath = path.join(sourceDirectory, cohortSourceFilename);
  const sourceSha256 = sha256(fs.readFileSync(sourcePath));
  const source = readCsvRecords(sourceDirectory, cohortSourceFilename);
  // Validate identifiers before scope filtering: missing phase must never silently disappear.
  if (source.length === 0 || source.some((row) => !/^[1-9]\d*$/.test(row.RID ?? "") || !row.ENTRY_PHASE?.trim())) {
    throw new Error("Missing or invalid source RID or entry phase.");
  }
  if (new Set(source.map((row) => row.RID)).size !== source.length) throw new Error("Duplicate source RID.");
  // The authoritative table also includes later-entry phases, which are outside this frozen scope.
  if (source.some((row) => ![...Object.keys(phaseCounts), "ADNI4", "TEAM"].includes(row.ENTRY_PHASE))) {
    throw new Error("Unknown source entry phase.");
  }
  const participants = validateSimulationRoster(source.filter((row) => Object.hasOwn(phaseCounts, row.ENTRY_PHASE))
    .map(({ RID, ENTRY_PHASE }) => ({ RID, ENTRY_PHASE })));
  if (sourceSha256 !== sha256(fs.readFileSync(sourcePath))) throw new Error("Cohort source changed during publication.");
  const rosterBytes = JSON.stringify(participants) + "\n";
  const provenance = provenanceSchema.parse({
    version: 1, publishedAt: new Date().toISOString(),
    source: { ...construction, filename: cohortSourceFilename, sha256: sourceSha256 },
    rosterSha256: sha256(rosterBytes), participantCount: participants.length, phaseCounts
  });
  if (fs.existsSync(directory)) {
    const existing = loadSimulationCohort(directory);
    if (existing.provenance.rosterSha256 !== provenance.rosterSha256 || existing.provenance.source.sha256 !== sourceSha256 ||
      JSON.stringify(existing.provenance.source.inputs) !== JSON.stringify(provenance.source.inputs) ||
      JSON.stringify(existing.provenance.source.scripts) !== JSON.stringify(provenance.source.scripts)) {
      throw new Error("A different frozen cohort already exists; automatic replacement is forbidden.");
    }
    return existing;
  }
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(path.dirname(directory), ".cohort-publication-"));
  try {
    fs.writeFileSync(path.join(staging, "roster.json"), rosterBytes, { mode: 0o600, flag: "wx" });
    fs.writeFileSync(path.join(staging, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    loadSimulationCohort(staging);
    // One directory rename publishes the validated pair together. An existing publication is never overwritten.
    fs.renameSync(staging, directory);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return loadSimulationCohort(directory);
}
