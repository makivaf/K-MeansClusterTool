import { createHash } from "node:crypto";
import { loadSimulationCohort, type SimulationCohortParticipant } from "./simulationCohort";

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

/** No side effects, shared random state, cached roster, or public participant output. */
export function getSimulationSample(simulationId: number): SimulationSample {
  if (!Number.isInteger(simulationId) || !Object.hasOwn(simulationSeeds, simulationId)) {
    throw new RangeError("Simulation ID must be an integer from 1 to 5.");
  }
  const id = simulationId as SimulationId;
  const seed = simulationSeeds[id];
  const { participants } = loadSimulationCohort();
  const phaseSourceCounts = {} as Record<EntryPhase, number>;
  const phaseSampleCounts = {} as Record<EntryPhase, number>;
  const sampleParticipantIds: string[] = [];
  for (const phase of phases) {
    const members = participants.filter((participant) => participant.ENTRY_PHASE === phase);
    const count = Math.floor(members.length * samplingFraction + 0.5);
    // Versioned seeded pseudorandom ranking gives a permutation without replacement.
    // The RID tie-breaker makes even a hash collision deterministic and locale-independent.
    const ranked = members.map(({ RID }) => ({ RID, rank: hash(["simulation-phase-rank-v1", seed, phase, RID]) }))
      .sort((left, right) => (left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : compareRid(left.RID, right.RID)));
    phaseSourceCounts[phase] = members.length;
    phaseSampleCounts[phase] = count;
    sampleParticipantIds.push(...ranked.slice(0, count).map(({ RID }) => RID));
  }
  sampleParticipantIds.sort(compareRid);
  return {
    simulationId: id, seed, samplingFraction, samplingMethod,
    sourceParticipantCount: participants.length, sampleParticipantCount: sampleParticipantIds.length,
    phaseSourceCounts, phaseSampleCounts, sampleParticipantIds,
    // Fingerprint identifies membership: UTF-8 compact JSON of the sorted string RID array, no newline.
    fingerprint: hash(sampleParticipantIds)
  };
}
