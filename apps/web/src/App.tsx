import { lazy, Suspense, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { UploadResponse } from "../../../packages/shared/src";
import { AppShell } from "./components/layout/AppShell";
import { useStudyFindings } from "./hooks/useStudyFindings";

const DatasetSetup = lazy(() => import("./pages/UploadAndCluster").then((module) => ({ default: module.UploadAndCluster })));
const StudyFindings = lazy(() => import("./pages/StudyFindingsPage").then((module) => ({ default: module.StudyFindingsPage })));
const SimulationRuns = lazy(() => import("./pages/SimulationRunsPage").then((module) => ({ default: module.SimulationRunsPage })));

export default function App() {
  const { pathname } = useLocation();
  // Validation belongs to these files. Refreshing requires validation again.
  const [dataset, setDataset] = useState<UploadResponse | null>(null);
  const analysis = useStudyFindings();
  const onValidated = (value: UploadResponse | null) => {
    analysis.reset();
    setDataset(value);
  };
  const gate = <p role="status">No analysis results yet. Upload, validate, and run the required datasets first.</p>;
  return <AppShell>
    <Suspense fallback={<p role="status">Loading page…</p>}>
      <div hidden={pathname !== "/dataset-setup"}><DatasetSetup onValidated={onValidated} analysis={analysis} dataset={dataset} /></div>
      <Routes>
        <Route path="/" element={<Navigate to="/dataset-setup" replace />} />
        <Route path="/dataset-setup" element={null} />
        <Route path="/study-findings" element={analysis.run ? <StudyFindings run={analysis.run} /> : gate} />
        <Route path="/simulation-runs" element={<SimulationRuns />} />
        <Route path="/upload-run" element={<Navigate to="/dataset-setup" replace />} />
        <Route path="/run-history" element={<Navigate to="/simulation-runs" replace />} />
        {/* Retired URLs never select historical or simulation results. */}
        {["existing-algorithm", "enhanced-algorithm", "summary-of-findings", "overview", "enhanced-kmeans", "cluster-findings", "enhancement-evaluation", "longitudinal-follow-up", "clusters", "baseline-vs-enhanced", "longitudinal", "validation"].map((path) =>
          <Route key={path} path={`/${path}`} element={<Navigate to="/study-findings" replace />} />)}
        <Route path="/data-preparation" element={<Navigate to="/dataset-setup" replace />} />
        <Route path="*" element={<Navigate to="/dataset-setup" replace />} />
      </Routes>
    </Suspense>
  </AppShell>;
}
