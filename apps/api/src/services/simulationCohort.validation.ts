import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analysisInputManifest } from "./analysisInputManifest";
import { cohortConstructionScripts, cohortSourceFilename, loadSimulationCohort, phaseCounts,
  publishSimulationCohort, sha256, validateSimulationRoster } from "./simulationCohort";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "simulation-cohort-test-"));
try {
  // Synthetic identifiers exist only in this temporary test fixture; never used for publication to the real store.
  let nextId = 1;
  const rows = Object.entries(phaseCounts).flatMap(([ENTRY_PHASE, count]) =>
    Array.from({ length: count }, () => ({ RID: String(nextId++), ENTRY_PHASE })));
  const source = path.join(root, "source");
  const destination = path.join(root, "frozen");
  fs.mkdirSync(source);
  const writeSource = (values = rows) => fs.writeFileSync(path.join(source, cohortSourceFilename),
    "RID,ENTRY_PHASE,PTID,diagnosis,cluster,severity,outcome\n" + values.map((row) =>
      `${row.RID},${row.ENTRY_PHASE},private,unused,unused,unused,unused`).join("\n") + "\n");
  const construction = { constructionId: crypto.randomUUID(),
    inputs: analysisInputManifest.map(({ filename }) => ({ filename, sha256: sha256(filename) })),
    scripts: cohortConstructionScripts.map((filename) => ({ filename, sha256: sha256(filename) })) };
  writeSource([...rows].reverse().concat({ RID: "99999", ENTRY_PHASE: "ADNI4" }));
  const published = publishSimulationCohort(source, construction, destination);
  assert.equal(published.participants.length, 2437);
  assert.deepEqual(published.participants, rows);
  assert.deepEqual(published.provenance.phaseCounts, phaseCounts);
  assert.equal(published.provenance.source.sha256, sha256(fs.readFileSync(path.join(source, cohortSourceFilename))));
  assert.ok(published.participants.every((row) => Object.keys(row).sort().join(",") === "ENTRY_PHASE,RID"));
  assert.deepEqual(publishSimulationCohort(source, { ...construction, constructionId: crypto.randomUUID() }, destination), published);
  assert.throws(() => publishSimulationCohort(source, { ...construction,
    scripts: construction.scripts.map((entry, index) => index === 0 ? { ...entry, filename: "unapproved.py" } : entry)
  }, path.join(root, "invalid-provenance")));
  assert.ok(!fs.existsSync(path.join(root, "invalid-provenance")));
  const rosterBytes = fs.readFileSync(path.join(destination, "roster.json"));
  const provenanceBytes = fs.readFileSync(path.join(destination, "provenance.json"));
  const invalidRosters = [
    rows.slice(1), [...rows, rows[0]], [rows[0], ...rows.slice(0, -1)],
    [{ ...rows[0], RID: "" }, ...rows.slice(1)],
    [{ ...rows[0], ENTRY_PHASE: "" }, ...rows.slice(1)],
    [{ ...rows[0], ENTRY_PHASE: "ADNI4" }, ...rows.slice(1)],
    [{ ...rows[0], ENTRY_PHASE: "ADNI2" }, ...rows.slice(1)],
    [{ ...rows[0], PTID: "forbidden" }, ...rows.slice(1)]
  ];
  for (const invalid of invalidRosters) assert.throws(() => validateSimulationRoster(invalid));
  for (const invalid of [
    [...rows, { RID: "100000", ENTRY_PHASE: "" }],
    [...rows, { RID: rows[0].RID, ENTRY_PHASE: "ADNI4" }],
    [...rows, { RID: "100000", ENTRY_PHASE: "UNKNOWN" }]
  ]) {
    writeSource(invalid);
    assert.throws(() => publishSimulationCohort(source, construction, path.join(root, "invalid")));
    assert.ok(!fs.existsSync(path.join(root, "invalid")));
  }
  writeSource(rows.map((row, index) => index === 0 ? { ...row, RID: "99998" } : row));
  assert.throws(() => publishSimulationCohort(source, construction, destination), /different frozen cohort/);
  assert.deepEqual(fs.readFileSync(path.join(destination, "roster.json")), rosterBytes);
  assert.deepEqual(fs.readFileSync(path.join(destination, "provenance.json")), provenanceBytes);
  fs.rmSync(source, { recursive: true, force: true });
  assert.deepEqual(loadSimulationCohort(destination), published); // Survives construction workspace deletion.
  fs.appendFileSync(path.join(destination, "roster.json"), " ");
  assert.throws(() => loadSimulationCohort(destination), /integrity/);
  fs.writeFileSync(path.join(destination, "roster.json"), rosterBytes);
  fs.writeFileSync(path.join(destination, "provenance.json"), JSON.stringify({ ...published.provenance, participantCount: 1 }));
  assert.throws(() => loadSimulationCohort(destination));
  assert.throws(() => loadSimulationCohort(path.join(root, "missing")));
  console.log("PASS canonical cohort: exact counts, unique IDs, scope, missing values, minimal fields, deterministic ordering, provenance, idempotence, no replacement, retention, and tamper detection.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
