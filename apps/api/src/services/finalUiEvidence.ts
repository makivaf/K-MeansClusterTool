import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { FinalUiEvidenceSchema } from "../../../../packages/shared/src/finalUiEvidence";
import { FrozenUnifiedStudyResultSchema } from "../../../../packages/shared/src/schema";
import { listRuns } from "./runRepository";
import { loadSopEvaluation } from "./sopEvaluationArtifact";
import { loadDefenseGeometry } from "./defenseGeometryArtifact";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// Python sources are hashed in canonical LF form (Windows checkouts may use CRLF), as in researchSourceMaterializer.
const sha = (file: string) => crypto.createHash("sha256").update(file.endsWith(".py") ? Buffer.from(fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n"), "utf8") : fs.readFileSync(file)).digest("hex");
/** Read existing artifacts; never fits or mutates a research result. */
export async function loadFinalUiEvidence() {
  const file = path.join(root, "apps/web/src/data/finalUiEvidence.json");
  const evidence = FinalUiEvidenceSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  for (const [name, expected] of Object.entries(evidence.sources ?? {})) {
    const absolute = path.resolve(root, name);
    if (!absolute.startsWith(root + path.sep) || sha(absolute) !== expected) throw new Error("Final UI evidence source drift.");
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/verification/source_manifest.json"), "utf8")) as { sha256: Record<string, string> };
  const longitudinal = JSON.parse(fs.readFileSync(path.join(root, "docs/verification/longitudinal.json"), "utf8")) as {
    sources: Record<string, string>; participants: number; observations: number;
    randomIntercept: { fixedEffects: Record<string, { estimate: number; ci95: [number, number]; pValue: number }> };
    randomSlope: { fixedEffects: Record<string, { estimate: number; ci95: [number, number]; pValue: number }> }
  };
  for (const name of Object.values(longitudinal.sources)) if (sha(path.join(root, name)) !== manifest.sha256[name]) throw new Error("Longitudinal source drift.");
  const effects = (model: typeof longitudinal.randomIntercept) => Object.fromEntries(Object.entries(model.fixedEffects).map(([key, value]) => [key, { estimate: value.estimate, ci95: value.ci95, pValue: value.pValue }]));
  evidence.models = { randomIntercept: effects(longitudinal.randomIntercept), randomSlope: effects(longitudinal.randomSlope) };
  const chart = JSON.parse(fs.readFileSync(path.join(root, "docs/verification/longitudinal_ui.json"), "utf8"));
  for (const [name, expected] of Object.entries(chart.sources)) if (sha(path.join(root, name)) !== expected) throw new Error("Longitudinal chart source drift.");
  evidence.observedMeans = chart.observedMeans;
  evidence.observedAnalysisSet = chart.observedAnalysisSet;
  const run = (await listRuns()).map(value => FrozenUnifiedStudyResultSchema.safeParse(value)).find(value => value.success)?.data;
  if (run) {
    if (evidence.headline) Object.assign(evidence.headline, { standardDimensions: run.preprocessing.retainedFeatures.length, enhancedDimensions: run.pca.components, varianceRetained: run.pca.cumulativeExplainedVariance });
  }
  // The legacy SOP evaluation/geometry artifacts are optional (projection only); a stale or
  // missing artifact must not block the verified longitudinal evidence.
  let evaluation: ReturnType<typeof loadSopEvaluation> = null, geometry: ReturnType<typeof loadDefenseGeometry> | null | undefined = null;
  try { evaluation = loadSopEvaluation(); geometry = evaluation && loadDefenseGeometry(evaluation); }
  catch (error) { console.warn("SOP evaluation projection unavailable:", (error as Error).message); }
  if (geometry) {
    const convert = (panel: typeof geometry.sop3.dpc[number]) => ({ points: panel.observations.map(p => ({ x: p.pc1, y: p.pc2, cluster: p.cluster })), means: panel.markers.filter(m => m.type === "final").map(m => ({ x: m.pc1, y: m.pc2, cluster: m.cluster })) });
    // SOP1 Standard uses the original Standard seed-0 partition on common PCs.
    const standard = geometry.sop1.baseline;
    if (standard.observations.length === geometry.sop3.dpc[0].observations.length)
      evidence.projection = { standard: { points: standard.observations.map(p => ({ x: p.pc1, y: p.pc2, cluster: p.cluster })), means: standard.markers.filter(m => m.type === "final").map(m => ({ x: m.pc1, y: m.pc2, cluster: m.cluster })) }, enhanced: convert(geometry.sop3.dpc[0]) };
  }
  evidence.sources = { ...evidence.sources, report: "docs/PIPELINE_VERIFICATION_OCT12.md", longitudinal: "docs/verification/longitudinal.json" };
  return FinalUiEvidenceSchema.parse(evidence);
}
