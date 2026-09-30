import { createHash } from "node:crypto";
import { loadSimulationCohort, type SimulationCohortParticipant } from "./simulationCohort";

import { SimulationConfigurationSchema, type SimulationConfiguration } from "../../../../packages/shared/src/simulation";

const simulationSeeds = { 1: 101, 2: 202, 3: 303, 4: 404, 5: 505 } as const;
type SimulationId = keyof typeof simulationSeeds;
type EntryPhase = SimulationCohortParticipant["ENTRY_PHASE"];
const phases: readonly EntryPhase[] = ["ADNI1", "ADNIGO", "ADNI2", "ADNI3"];
const samplingFraction = 0.80;
const samplingMethod = "deterministic stratified random sampling by ENTRY_PHASE";

export type SimulationSample = {
  simulationId: SimulationId;
  seed: number;
  samplingFraction: number;
  samplingMethod: string;
  sourceParticipantCount: number;
  sampleParticipantCount: number;
  phaseSourceCounts: Record<EntryPhase, number>;
  phaseSampleCounts: Record<EntryPhase, number>;
  /** Backend-internal: pass this same list unchanged to both future method runners. */
  sampleParticipantIds: string[];
  fingerprint: string;
};

const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
// Numeric ordering without converting potentially large identifiers to floating point.
const compareRid = (left: string, right: string): number => left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);

const samples = new Map<string, SimulationSample>();
/** No shared random state or public participant output; cached values are copied. */
export function getSimulationSample(simulationId: number, configuration?: SimulationConfiguration): SimulationSample {
  if (!Number.isInteger(simulationId) || !Object.hasOwn(simulationSeeds, simulationId)) {
    throw new RangeError("Simulation ID must be an integer from 1 to 5.");
  }
  if (configuration) SimulationConfigurationSchema.parse(configuration);
  const id = simulationId as SimulationId;
  const seed = simulationSeeds[id];
  const { participants, provenance } = loadSimulationCohort();
  const cacheKey = `${provenance.rosterSha256}:${provenance.source.sha256}:${id}:${configuration?.sampleCount ?? "legacy"}`;
  const cached = samples.get(cacheKey);
  if (cached) return structuredClone(cached);
  const phaseSourceCounts = {} as Record<EntryPhase, number>;
  const phaseSampleCounts = {} as Record<EntryPhase, number>;
  const sampleParticipantIds: string[] = [];
  // Largest-remainder allocation preserves proportions and the exact requested n.
  const target = configuration?.sampleCount;
  const allocation = phases.map(phase => {
    const size = participants.filter(row => row.ENTRY_PHASE === phase).length;
    const quota = size * (target === undefined ? samplingFraction : target / participants.length);
    return { phase, count: target === undefined ? Math.floor(quota + 0.5) : Math.floor(quota), remainder: quota % 1 };
  });
  if (target !== undefined) {
    const remaining = target - allocation.reduce((sum, row) => sum + row.count, 0);
    [...allocation].sort((a, b) => b.remainder - a.remainder).slice(0, remaining).forEach(row => row.count++);
  }
  for (const phase of phases) {
    const members = participants.filter((participant) => participant.ENTRY_PHASE === phase);
    const count = allocation.find(row => row.phase === phase)!.count;
    // Versioned seeded pseudorandom ranking gives a permutation without replacement.
    // The RID tie-breaker makes even a hash collision deterministic and locale-independent.
    const ranked = members.map(({ RID }) => ({ RID, rank: hash(["simulation-phase-rank-v1", seed, phase, RID]) }))
      .sort((left, right) => (left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : compareRid(left.RID, right.RID)));
    phaseSourceCounts[phase] = members.length;
    phaseSampleCounts[phase] = count;
    sampleParticipantIds.push(...ranked.slice(0, count).map(({ RID }) => RID));
  }
  sampleParticipantIds.sort(compareRid);
  const sample: SimulationSample = {
    simulationId: id, seed, samplingFraction: target === undefined ? samplingFraction : target / participants.length, samplingMethod,
    sourceParticipantCount: participants.length, sampleParticipantCount: sampleParticipantIds.length,
    phaseSourceCounts, phaseSampleCounts, sampleParticipantIds,
    // Fingerprint identifies membership: UTF-8 compact JSON of the sorted string RID array, no newline.
    fingerprint: hash(sampleParticipantIds)
  };
  if (samples.size >= 64) samples.clear();
  samples.set(cacheKey, structuredClone(sample));
  return sample;
}
