import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { canonicalUploadFilename } from "../../../web/src/utils/uploadFilename";
import { formatSourceFileLabel } from "../../../web/src/utils/sourceFileLabels";

const source = fs.readFileSync(new URL("../../../web/src/pages/UploadAndCluster.tsx", import.meta.url), "utf8");
// Exercise the actual selection handlers without adding a browser test dependency.
const datasets = source.match(/const DATASETS = [\s\S]*?as const;/)![0];
const handlers = source.slice(source.indexOf("  const chooseFiles ="), source.indexOf("  const completeRun ="));
const harness = ts.transpileModule(`
  ${datasets}
  let files = {}, unexpected = [];
  const fileControlsLocked = false;
  const setFiles = (update) => { files = update(files); };
  const setUnexpected = (value) => { unexpected = value; };
  const resetWorkflow = () => {};
  ${handlers}
  return { chooseFiles, replaceFile, snapshot: () => ({
    files, unexpected,
    supplied: DATASETS.flatMap(([, name]) => files[name] ? [files[name]] : []).length
  }) };
`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const createHarness = () => new Function("canonicalUploadFilename", harness)(canonicalUploadFilename);
const mappings = [
  ["ADAS.csv", "ADAS"], ["CDR.csv", "CDR"], ["FAQ.csv", "FAQ"],
  ["GDSCALE.csv", "GDS"], ["MMSE.csv", "MMSE"],
  ["NEUROBAT.csv", "NEUROBAT"], ["NPIQ.csv", "NPI-Q"]
];
for (const original of [false, true]) {
  const uploader = createHarness();
  const files = mappings.map(([name]) => ({ name: original ? canonicalUploadFilename(name) : name }));
  uploader.chooseFiles(files);
  assert.equal(`${uploader.snapshot().supplied} of 7 supplied`, "7 of 7 supplied");
  assert.deepEqual(uploader.snapshot().unexpected, []);
  mappings.forEach(([name, label], index) => {
    const canonical = canonicalUploadFilename(name);
    assert.equal(formatSourceFileLabel(canonical), label);
    assert.equal(canonicalUploadFilename(canonical), canonical);
    assert.equal(uploader.snapshot().files[canonical], files[index]);
    const replacement = { name: files[index].name };
    uploader.replaceFile(canonical, replacement);
    assert.equal(uploader.snapshot().files[canonical], replacement);
  });
  uploader.replaceFile(canonicalUploadFilename("ADAS.csv"), { name: "CDR.csv" });
  assert.deepEqual(uploader.snapshot().unexpected, ["CDR.csv"]);
}
const uploader = createHarness();
const unknown = ["unknown.csv", "ADAS.csv.bak", "Other_ADAS.csv"];
uploader.chooseFiles(unknown.map((name) => ({ name })));
assert.equal(uploader.snapshot().supplied, 0);
assert.deepEqual(uploader.snapshot().unexpected, unknown);
uploader.replaceFile(canonicalUploadFilename("ADAS.csv"), { name: "unknown.csv" });
assert.equal(uploader.snapshot().supplied, 0);
assert.deepEqual(uploader.snapshot().unexpected, ["unknown.csv"]);
assert.ok(source.includes('body.append("files", file, canonicalUploadFilename(file.name))'));
console.log("PASS upload filename regression: short and original exports supply 7 of 7, dataset labels match, replacements work, and unknown/wrong-slot filenames fail");
