import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { canonicalUploadFilename } from "../../../web/src/utils/uploadFilename";
import { formatSourceFileLabel } from "../../../web/src/utils/sourceFileLabels";
import { DATASETS, isDatasetReady } from "../../../web/src/utils/validatedDataset";
import { analysisInputManifest } from "./analysisInputManifest";

assert.deepEqual(DATASETS.map(([, name]) => name), analysisInputManifest.map(file => file.filename));
const source = fs.readFileSync(new URL("../../../web/src/pages/UploadAndCluster.tsx", import.meta.url), "utf8");
const handlers = source.slice(source.indexOf("  const chooseFiles ="), source.indexOf("  const validate ="));
const harness = ts.transpileModule(`
  let files = {}, invalid = [], error = null;
  const busy = false;
  const onValidated = () => {};
  const setFiles = update => { files = update(files); };
  const setInvalidFiles = value => { invalid = value; };
  const setError = value => { error = value; };
  ${handlers}
  return { chooseFiles, snapshot: () => ({ files, invalid, error }) };
`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
for (const date of [null, "10Aug2026", "Aug102026"]) {
  const uploader = new Function("canonicalUploadFilename", "DATASETS", harness)(canonicalUploadFilename, DATASETS);
  const files = DATASETS.map(([, name]) => ({ name: date ? `All_Subjects_${name.slice(0, -4)}_${date}.csv` : name }));
  uploader.chooseFiles(files);
  assert.equal(Object.keys(uploader.snapshot().files).length, 7);
  assert.equal(uploader.snapshot().error, null);
  DATASETS.forEach(([label, name], index) => {
    assert.equal(canonicalUploadFilename(files[index].name), name);
    assert.equal(canonicalUploadFilename(name), name);
    assert.equal(formatSourceFileLabel(name), label);
    assert.equal(formatSourceFileLabel(files[index].name), label);
    assert.equal(uploader.snapshot().files[name], files[index]);
    const replacement = { name: files[index].name };
    uploader.chooseFiles([replacement], name);
    assert.equal(uploader.snapshot().files[name], replacement);
  });
  uploader.chooseFiles([{ name: "CDR.csv" }], "ADAS.csv");
  assert.equal(uploader.snapshot().files["ADAS.csv"], undefined);
  assert.deepEqual(uploader.snapshot().invalid, ["ADAS.csv"]);
}
for (const name of ["unknown.csv", "ADAS.csv.bak", "Other_ADAS.csv"]) assert.equal(canonicalUploadFilename(name), name);
const dataset = { upload_ref: "test", file_count: 7, filenames: DATASETS.map(([, name]) => name) };
assert.ok(isDatasetReady(dataset));
assert.equal(isDatasetReady({ ...dataset, filenames: dataset.filenames.slice(1) }), false);
assert.equal(isDatasetReady({ ...dataset, filenames: Array(7).fill("ADAS.csv") }), false);
assert.ok(source.includes('body.append("files", files[name], name)'));
console.log("PASS canonical filenames, legacy upload aliases, dataset labels/readiness, replacements and canonical multipart filenames.");
