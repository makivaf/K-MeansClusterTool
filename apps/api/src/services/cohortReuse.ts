import fs from "node:fs";
import path from "node:path";
import { canonicalizeResearchPythonSource, sha256Bytes as sha256 } from "./researchSourceMaterializer";

/** Only construction inputs define reuse; method result compatibility is separate. */
export function findReusableCohort(directory: string, dependenciesHash: string, inputHash: string,
  sourceFiles: string[][], filenames: string[]): string | undefined {
  for (const entry of fs.readdirSync(directory)) {
    if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
    try {
      const prior = JSON.parse(fs.readFileSync(path.join(directory, entry, "request.json"), "utf8"));
      if (prior.scope !== "study" || prior.dependenciesHash !== dependenciesHash) continue;
      const candidate = path.resolve(path.dirname(prior.sourcePath), "../..");
      if (!candidate.startsWith(path.resolve(directory, "cohorts")+path.sep)) continue;
      if (sourceFiles.some(([name, hash]) => sha256(canonicalizeResearchPythonSource(fs.readFileSync(path.join(candidate, "scripts/research/study_entry", name)))) !== hash)) continue;
      const rawHash = sha256(Buffer.from(JSON.stringify(filenames.map(filename => [filename, sha256(fs.readFileSync(path.join(candidate,"data/raw/adni",filename)))]))));
      const outputHash = sha256(fs.readFileSync(prior.sourcePath));
      if (rawHash === inputHash && outputHash === prior.sourceHash && JSON.parse(fs.readFileSync(path.join(candidate,"source.json"),"utf8")).sha256 === outputHash) return candidate;
    } catch { /* Missing or incompatible evidence never authorizes reuse. */ }
  }
  return undefined;
}
