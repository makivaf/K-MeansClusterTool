import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import type { DefenseGeometry } from "../../../../packages/shared/src/schema";
import type { SimulationAnalysis } from "../../../../packages/shared/src/simulation";
import { CalculationSetSchema } from "../../../../packages/shared/src/calculationEvidence";
import { readCsvRecords } from "./artifactReaders";
import { partitionCalculations, verifyCalculationMetrics } from "./partitionCalculations";

const cache = new Map<string, z.infer<typeof CalculationSetSchema>>();
const digest = (bytes: string | Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
const metrics = (row: Record<string, string>) => ({ silhouette: Number(row.silhouette), davies_bouldin: Number(row.davies_bouldin), calinski_harabasz: Number(row.calinski_harabasz) });
const matrix = (rows: Record<string, string>[], columns: string[]) => rows.map(row => columns.map(column => {
  if (row[column] === undefined || row[column] === "") throw new Error("Missing calculation coordinate.");
  return Number(row[column]);
}));
const sameIds = (rows: Record<string, string>[], ids: string[]) => {
  if (rows.length !== ids.length || rows.some((row, i) => row.RID !== ids[i])) throw new Error("Calculation participant order mismatch.");
};

/** Sources have the same frozen hash linkage as the displayed defense panels. */
export function studyCalculations(directory: string, geometry: DefenseGeometry | null) {
  if (!geometry) return undefined;
  const names = ["clustering_features_standardized.csv", "clustering_pca_scores.csv", "baseline_kmeans_assignments.csv",
    "baseline_kmeans_runs.csv", "dpc_comparison_random_assignments.csv", "dpc_comparison_random_runs.csv", "unified_cluster_assignments.csv", "enhanced_kmeans_metrics.csv"];
  if (names.every(name => !fs.existsSync(path.join(directory, name)))) return undefined;
  const hashes = names.map(name => {
    const hash = digest(fs.readFileSync(path.join(directory, name)));
    if (hash !== geometry.provenance.sourceSha256[`data/interim/${name}`]) throw new Error("Calculation evidence source drift detected.");
    return hash;
  });
  const key = hashes.join(":");
  if (cache.has(key)) return structuredClone(cache.get(key)!);
  const original = readCsvRecords(directory, names[0]), pca = readCsvRecords(directory, names[1]);
  const ids = original.map(row => row.RID);
  sameIds(pca, ids);
  const seed = geometry.sop1.seed;
  const labels = (name: string, random: boolean) => {
    const rows = readCsvRecords(directory, name).filter(row => !random || Number(row.seed) === seed);
    sameIds(rows, ids);
    return rows.map(row => Number(row.cluster_label));
  };
  const standardLabels = labels(names[2], true), pcaLabels = labels(names[4], true), enhancedLabels = labels(names[6], false);
  for (const [actual, panel] of [[standardLabels, geometry.sop1.baseline], [pcaLabels, geometry.sop1.pcaOnly], [enhancedLabels, geometry.sop3.dpc[0]]] as const) {
    if (actual.some((label, i) => label !== panel.observations[i].cluster)) throw new Error("Calculation assignments disagree with displayed partition.");
  }
  const features = Object.keys(original[0]).filter(column => column !== "RID" && column !== "PTID");
  const pcs = Object.keys(pca[0]).filter(column => /^PC\d+$/.test(column));
  const X = matrix(original, features), Z = matrix(pca, pcs);
  const standard = partitionCalculations(X, ids, standardLabels, `${features.length} standardized features`, seed);
  const controlled = partitionCalculations(Z, ids, pcaLabels, `${pcs.length} principal components`, seed);
  const enhanced = partitionCalculations(Z, ids, enhancedLabels, `${pcs.length} principal components`);
  verifyCalculationMetrics(standard, metrics(readCsvRecords(directory, names[3]).find(row => Number(row.seed) === seed)!));
  verifyCalculationMetrics(controlled, metrics(readCsvRecords(directory, names[5]).find(row => Number(row.seed) === seed)!));
  const final = Object.fromEntries(readCsvRecords(directory, names[7]).map(row => [row.metric, Number(row.value)]));
  verifyCalculationMetrics(enhanced, { silhouette: final.silhouette_coefficient, davies_bouldin: final.davies_bouldin_index, calinski_harabasz: final.calinski_harabasz_index });
  const result = CalculationSetSchema.parse({ standard, pca: controlled, enhanced });
  cache.set(key, result);
  return structuredClone(result);
}

/** Caller verifies workspace membership/source. Exact stored scores and labels
 * additionally bind the calculations to this completion, including old caches. */
export function simulationCalculations(workspace: string, analysis: SimulationAnalysis) {
  if (!analysis.projection) return undefined;
  const directory = path.join(workspace, "data/interim");
  const names = ["clustering_features_standardized.csv", "clustering_pca_scores.csv", "baseline_kmeans_assignments.csv"];
  if (names.some(name => !fs.existsSync(path.join(directory, name)))) return undefined;
  const original = readCsvRecords(directory, names[0]), pca = readCsvRecords(directory, names[1]);
  const request = JSON.parse(fs.readFileSync(path.join(workspace, "request.json"), "utf8"));
  const ids: string[] = request.sampleParticipantIds;
  sameIds(original, ids); sameIds(pca, ids);
  const projection = analysis.projection;
  if (pca.length !== projection.points.length || pca.some((row, i) => Math.abs(Number(row.PC1) - projection.points[i].x) > 1e-10 || Math.abs(Number(row.PC2) - projection.points[i].y) > 1e-10)) throw new Error("Saved calculation projection mismatch.");
  const assignments = readCsvRecords(directory, names[2]).filter(row => Number(row.seed) === projection.standardSeed);
  sameIds(assignments, ids);
  if (assignments.some((row, i) => Number(row.cluster_label) !== projection.points[i].standard)) throw new Error("Saved Standard calculation labels mismatch.");
  const privateFile = path.join(workspace, "controlled-pca-partition.json");
  const privateBytes = fs.existsSync(privateFile) ? fs.readFileSync(privateFile, "utf8") : "";
  const key = digest(JSON.stringify([names.map(name => digest(fs.readFileSync(path.join(directory, name)))), ids, projection, analysis.existing.runs[0].metrics, analysis.enhanced.metrics, analysis.pcaContribution, privateBytes]));
  if (cache.has(key)) return structuredClone(cache.get(key)!);
  const X = matrix(original, analysis.enhanced.retainedVariables);
  const Z = matrix(pca, Array.from({ length: analysis.enhanced.pcaComponents }, (_, i) => `PC${i + 1}`));
  const standard = partitionCalculations(X, ids, assignments.map(row => Number(row.cluster_label)), `${X[0].length} standardized features`, projection.standardSeed);
  const enhanced = partitionCalculations(Z, ids, projection.points.map(row => row.enhanced), `${Z[0].length} principal components`);
  verifyCalculationMetrics(standard, analysis.existing.runs.find(run => run.seed === projection.standardSeed)!.metrics);
  verifyCalculationMetrics(enhanced, analysis.enhanced.metrics);
  let controlled;
  if (privateBytes) {
    const evidence = z.object({ seed: z.number().int().nonnegative(), k: z.number().int().min(2),
      ids: z.array(z.string()), labels: z.array(z.number().int().nonnegative()),
      metrics: z.object({ silhouette: z.number().finite(), davies_bouldin: z.number().finite(), calinski_harabasz: z.number().finite() }).strict()
    }).strict().parse(JSON.parse(privateBytes));
    if (JSON.stringify(evidence.ids) !== JSON.stringify(ids) || evidence.k !== analysis.pcaContribution?.k) throw new Error("Controlled PCA evidence membership/k mismatch.");
    controlled = partitionCalculations(Z, ids, evidence.labels, `${Z[0].length} principal components`, evidence.seed);
    if (controlled.k !== evidence.k) throw new Error("Controlled PCA partition k mismatch.");
    verifyCalculationMetrics(controlled, evidence.metrics);
  }
  const result = CalculationSetSchema.parse({ standard, enhanced, pca: controlled });
  if (cache.size >= 32) cache.clear();
  cache.set(key, result);
  return structuredClone(result);
}
