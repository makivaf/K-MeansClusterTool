import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useRunData } from "./hooks/useRunData";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ClustersPage = lazy(() => import("./pages/ClustersPage").then((module) => ({ default: module.ClustersPage })));
const EnhancedKMeansPage = lazy(() => import("./pages/EnhancedKMeansPage").then((module) => ({ default: module.EnhancedKMeansPage })));
const UploadAndCluster = lazy(() => import("./pages/UploadAndCluster").then((module) => ({ default: module.UploadAndCluster })));
const RunHistoryPage = lazy(() => import("./pages/RunHistoryPage").then((module) => ({ default: module.RunHistoryPage })));

const LegacyRouteRedirect = ({ to }: { to: string }) => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
};

export default function App() {
  const runState = useRunData();
  const run = runState.selectedRun;
  const location = useLocation();
  const allowWithoutRun = location.pathname === "/upload-run" || location.pathname === "/run-history";

  return (
    <AppShell {...runState} allowWithoutRun={allowWithoutRun}>
      <Suspense fallback={<div className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Loading research view...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/existing-algorithm" replace />} />
          <Route path="/existing-algorithm" element={<OverviewPage run={run} />} />
          <Route path="/enhanced-algorithm" element={<EnhancedKMeansPage run={run} />} />
          <Route path="/summary-of-findings" element={<ClustersPage run={run} />} />
          <Route path="/run-history" element={<RunHistoryPage runs={runState.runs} selectedRunId={runState.selectedRunId} onSelectRun={runState.setSelectedRunId} />} />
          <Route path="/upload-run" element={<UploadAndCluster />} />
          <Route path="/overview" element={<LegacyRouteRedirect to="/existing-algorithm" />} />
          <Route path="/enhanced-kmeans" element={<LegacyRouteRedirect to="/enhanced-algorithm" />} />
          <Route path="/cluster-findings" element={<LegacyRouteRedirect to="/summary-of-findings" />} />
          <Route path="/enhancement-evaluation" element={<LegacyRouteRedirect to="/existing-algorithm" />} />
          <Route path="/longitudinal-follow-up" element={<LegacyRouteRedirect to="/summary-of-findings" />} />
          <Route path="/clusters" element={<LegacyRouteRedirect to="/summary-of-findings" />} />
          <Route path="/baseline-vs-enhanced" element={<LegacyRouteRedirect to="/existing-algorithm" />} />
          <Route path="/longitudinal" element={<LegacyRouteRedirect to="/summary-of-findings" />} />
          <Route path="/data-preparation" element={<Navigate to="/existing-algorithm#technical-pipeline" replace />} />
          <Route path="/validation" element={<Navigate to="/summary-of-findings" replace />} />
          <Route path="*" element={<Navigate to="/existing-algorithm" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
