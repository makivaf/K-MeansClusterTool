import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { loadSimulationCohort } from "./simulationCohort";
import { getSimulationSample } from "./simulationSample";

// Integration checks deliberately use the real canonical loader, never a substitute cohort.
const { participants } = loadSimulationCohort();
const membership = new Map(participants.map(({ RID, ENTRY_PHASE }) => [RID, ENTRY_PHASE]));
const expectedSource = { ADNI1: 819, ADNIGO: 130, ADNI2: 789, ADNI3: 699 };
const expectedSample = { ADNI1: 655, ADNIGO: 104, ADNI2: 631, ADNI3: 559 };
const samples = [1, 2, 3, 4, 5].map(id => getSimulationSample(id));
for (const sample of samples) {
  assert.deepEqual(getSimulationSample(sample.simulationId), sample, "Replay must preserve IDs, fingerprint, and metadata");
  assert.equal(sample.seed, [101, 202, 303, 404, 505][sample.simulationId - 1]);
  assert.equal(sample.samplingFraction, 0.8);
  assert.equal(sample.samplingMethod, "deterministic stratified random sampling by ENTRY_PHASE");
  assert.equal(sample.sourceParticipantCount, participants.length);
  assert.deepEqual(sample.phaseSourceCounts, expectedSource);
  assert.deepEqual(sample.phaseSampleCounts, expectedSample);
  assert.equal(sample.sampleParticipantCount, 1949);
  assert.equal(sample.sampleParticipantIds.length, sample.sampleParticipantCount);
  assert.equal(new Set(sample.sampleParticipantIds).size, sample.sampleParticipantCount, "Sampling must be without replacement");
  assert.equal(sample.sampleParticipantCount, Object.values(sample.phaseSampleCounts).reduce((sum, count) => sum + count, 0));
  const observed = { ADNI1: 0, ADNIGO: 0, ADNI2: 0, ADNI3: 0 };
  for (const rid of sample.sampleParticipantIds) {
    const phase = membership.get(rid);
    assert.ok(phase && Object.hasOwn(expectedSource, phase), "Every sampled RID must belong to an allowed canonical phase");
    observed[phase] += 1;
  }
  assert.deepEqual(observed, sample.phaseSampleCounts);
  for (const phase of Object.keys(observed) as (keyof typeof observed)[]) {
    assert.ok(Math.abs(observed[phase] - expectedSource[phase] * 0.80) <= 0.5);
    assert.ok(observed[phase] <= expectedSource[phase]);
  }
  for (let index = 1; index < sample.sampleParticipantIds.length; index++) {
    assert.ok(BigInt(sample.sampleParticipantIds[index - 1]) < BigInt(sample.sampleParticipantIds[index]), "Final IDs must be numerically sorted");
  }
  assert.equal(sample.fingerprint, createHash("sha256").update(JSON.stringify(sample.sampleParticipantIds), "utf8").digest("hex"));
}
assert.equal(new Set(samples.map((sample) => sample.fingerprint)).size, 5, "All five simulations must differ");
for (let index = 1; index < samples.length; index++) {
  const previous = new Set(samples[index - 1].sampleParticipantIds);
  assert.ok(samples[index].sampleParticipantIds.some((rid) => previous.has(rid)), "Cross-simulation overlap is allowed");
  assert.ok(samples[index].sampleParticipantIds.some((rid) => !previous.has(rid)));
}
// Caller mutation must not affect a later invocation or the frozen cohort.
const mutable = getSimulationSample(1);
mutable.sampleParticipantIds.pop();
mutable.phaseSampleCounts.ADNI1 = 0;
assert.deepEqual(getSimulationSample(1), samples[0]);
assert.deepEqual(loadSimulationCohort().participants, participants);
for (const invalid of [0, 6, -1, 1.5, NaN, Infinity, "1", null, undefined]) {
  assert.throws(() => getSimulationSample(invalid as number), RangeError);
}
// Guard the narrow data dependency: only the validated roster and Node hashing are imported.
const source = fs.readFileSync(new URL("./simulationSample.ts", import.meta.url), "utf8");
assert.deepEqual([...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]), ["node:crypto", "./simulationCohort", "../../../../packages/shared/src/simulation"]);
assert.ok(!/\b(diagnosis|cluster|severity|outcome|PCA|NbClust|DPC|longitudinal)\b/i.test(source));
assert.ok(!/Math\.random|Date\.|readFile|roster\.json/.test(source));
console.log("PASS all five canonical samples: replay, fingerprints, distinct sets, membership, scope, rounding, no replacement, sorting, isolation, and restricted data dependencies.");
// Aggregate-only verification output: never print participant IDs.
console.log(JSON.stringify(samples.map(({ simulationId, seed, sampleParticipantCount, phaseSampleCounts, fingerprint }) =>
  ({ simulationId, seed, sampleParticipantCount, phaseSampleCounts, fingerprint })), null, 2));

for (const sampleCount of [100, 101, 500, 1949, 2436, 2437]) {
  const configuration = { sampleMode: "custom" as const, sampleCount, manualK: 2 };
  const sample = getSimulationSample(1, configuration);
  assert.equal(sample.sampleParticipantCount, sampleCount);
  assert.equal(new Set(sample.sampleParticipantIds).size, sampleCount);
  assert.ok(sample.sampleParticipantIds.every(id => membership.has(id)));
  assert.deepEqual(getSimulationSample(1, configuration), sample);
  assert.deepEqual(getSimulationSample(1, { ...configuration, manualK: 10 }).sampleParticipantIds, sample.sampleParticipantIds);
}
assert.equal(getSimulationSample(1, { sampleMode: "full", sampleCount: 2437, manualK: 2 }).sampleParticipantCount, 2437);
assert.notEqual(getSimulationSample(1, { sampleMode: "custom", sampleCount: 100, manualK: 2 }).fingerprint,
  getSimulationSample(1, { sampleMode: "custom", sampleCount: 101, manualK: 2 }).fingerprint);
for (const sampleCount of [99, 2438, 100.5, NaN]) assert.throws(() => getSimulationSample(1, { sampleMode: "custom", sampleCount, manualK: 2 }));
console.log("PASS full/custom participant counts, no replacement, reproducibility, manual-k independent membership and changed sample fingerprints.");
