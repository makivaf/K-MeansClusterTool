import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { analysisInputManifest, validateAnalysisInputManifest } from "../services/analysisInputManifest";
import { cohortConstructionScripts, publishSimulationCohort, sha256, simulationCohortRoot } from "../services/simulationCohort";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function main() {
  const [uploadArgument, ...extra] = process.argv.slice(2);
  if (!uploadArgument || extra.length) throw new Error("Specify exactly one validated upload directory.");
  const uploadDirectory = fs.realpathSync(path.resolve(uploadArgument));
  const uploadRoot = fs.realpathSync(path.join(repositoryRoot, "apps/api/uploads"));
  if (path.dirname(uploadDirectory) !== uploadRoot || !/^upload-\d{13}-[a-f0-9]{12}$/.test(path.basename(uploadDirectory))) {
    throw new Error("Source must be an explicit backend upload, not a diagnostic workspace.");
  }
  validateAnalysisInputManifest(uploadDirectory);
  const privateRoot = path.dirname(simulationCohortRoot);
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const workspace = fs.mkdtempSync(path.join(privateRoot, ".cohort-construction-"));
  try {
    const raw = path.join(workspace, "data/raw/adni");
    const interim = path.join(workspace, "data/interim");
    const scriptsDirectory = path.join(workspace, "scripts/research/study_entry");
    for (const directory of [raw, interim, scriptsDirectory]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const inputs = analysisInputManifest.map(({ filename }) => {
      const bytes = fs.readFileSync(path.join(uploadDirectory, filename));
      fs.writeFileSync(path.join(raw, filename), bytes, { mode: 0o600 });
      return { filename, sha256: sha256(bytes) };
    });
    validateAnalysisInputManifest(raw);
    const scripts = cohortConstructionScripts.map((filename) => {
      const bytes = fs.readFileSync(path.join(repositoryRoot, "scripts/research/study_entry", filename));
      fs.writeFileSync(path.join(scriptsDirectory, filename), bytes, { mode: 0o600 });
      return { filename, sha256: sha256(bytes) };
    });
    const python = process.env.RESEARCH_PYTHON
      ? path.resolve(repositoryRoot, process.env.RESEARCH_PYTHON)
      : path.join(repositoryRoot, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
    for (const { filename } of scripts) {
      console.log(`Cohort construction: ${filename}`);
      const result = spawnSync(python, [path.join(scriptsDirectory, filename)], {
        cwd: workspace, windowsHide: true, shell: false, encoding: "utf8", timeout: 20 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
      });
      // Research stdout/stderr can contain identifiers; never forward it to public logs.
      if (result.error || result.status !== 0) throw new Error(`Cohort construction failed at ${filename}.`);
    }
    const { provenance } = publishSimulationCohort(interim, { constructionId: crypto.randomUUID(), inputs, scripts });
    console.log(JSON.stringify({ rosterPath: path.join(simulationCohortRoot, "roster.json"),
      participantCount: provenance.participantCount, phaseCounts: provenance.phaseCounts,
      rosterSha256: provenance.rosterSha256, sourceSha256: provenance.source.sha256 }, null, 2));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

try { main(); } catch {
  console.error("Cohort publication failed. Check the explicit upload, Python environment, cohort validation, and existing frozen publication. No replacement was performed.");
  process.exitCode = 1;
}
