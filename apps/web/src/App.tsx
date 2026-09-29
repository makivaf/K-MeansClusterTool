import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { UploadResponse } from "../../../packages/shared/src";
import { AppShell } from "./components/layout/AppShell";
import { useStudyFindings } from "./hooks/useStudyFindings";

const DatasetSetup = lazy(() => import("./pages/UploadAndCluster").then((module) => ({ default: module.UploadAndCluster })));
const StudyFindings = lazy(() => import("./pages/StudyFindingsPage").then((module) => ({ default: module.StudyFindingsPage })));
const SimulationRuns = lazy(() => import("./pages/SimulationRunsPage").then((module) => ({ default: module.SimulationRunsPage })));

export default function App() {
  const { pathname } = useLocation();
  const [simulationVisited, setSimulationVisited] = useState(false);
  useEffect(() => {
    if (pathname === "/simulation-runs") setSimulationVisited(true);
  }, [pathname]);
  // Validation belongs to this running app; navigation preserves it, reloads do not.
  const [dataset, setDataset] = useState<UploadResponse | null>(null);
  const analysis = useStudyFindings(dataset);
  const onValidated = (value: UploadResponse | null) => {
    analysis.reset();
    setDataset(value);
  };
  return <AppShell>
    <Suspense fallback={<p role="status">Loading page…</p>}>
      <div hidden={pathname !== "/dataset-setup"}><DatasetSetup onValidated={onValidated} dataset={dataset} /></div>
      {/* Keep the visited simulation mounted, as with Dataset Setup, so route
          changes preserve configuration, results, and in-flight polling. */}
      {(simulationVisited || pathname === "/simulation-runs") && <div hidden={pathname !== "/simulation-runs"}><SimulationRuns /></div>}
      <Routes>
        <Route path="/" element={<Navigate to="/dataset-setup" replace />} />
        <Route path="/dataset-setup" element={null} />
        <Route path="/study-findings" element={<StudyFindings analysis={analysis} dataset={dataset} />} />
        <Route path="/simulation-runs" element={null} />
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
