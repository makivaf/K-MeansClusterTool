import type { BaselineCandidateSweep } from "../../../../packages/shared/src";

export const BASELINE_K_MIN = 2;
export const BASELINE_K_MAX = 10;
export const selectBaselineCandidate = (sweep: BaselineCandidateSweep | null, k: number) => {
  if (!Number.isInteger(k) || k < BASELINE_K_MIN || k > BASELINE_K_MAX) throw new RangeError("Baseline k must be an integer from 2 to 10.");
  return sweep?.candidates.find((candidate) => candidate.k === k) ?? null;
};
