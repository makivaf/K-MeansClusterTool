import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useRunData } from "./hooks/useRunData";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const EnhancedKMeansPage = lazy(() => import("./pages/EnhancedKMeansPage").then((module) => ({ default: module.EnhancedKMeansPage })));
const ClustersPage = lazy(() => import("./pages/ClustersPage").then((module) => ({ default: module.ClustersPage })));
const BaselineVsEnhancedPage = lazy(() => import("./pages/BaselineVsEnhancedPage").then((module) => ({ default: module.BaselineVsEnhancedPage })));
const LongitudinalProgressionPage = lazy(() => import("./pages/LongitudinalProgressionPage").then((module) => ({ default: module.LongitudinalProgressionPage })));
const UploadAndCluster = lazy(() => import("./pages/UploadAndCluster").then((module) => ({ default: module.UploadAndCluster })));

const LegacyRouteRedirect = ({ to }: { to: string }) => {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
};

export default function App() {
  const runState = useRunData();
  const run = runState.selectedRun;
  const location = useLocation();

  return (
    <AppShell {...runState} allowWithoutRun={location.pathname === "/upload-run"}>
      <Suspense fallback={<div className="rounded-xl border border-border bg-white p-6 text-sm text-muted">Loading research view…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage run={run} />} />
          <Route path="/enhanced-kmeans" element={<EnhancedKMeansPage run={run} />} />
          <Route path="/cluster-findings" element={<ClustersPage run={run} />} />
          <Route path="/enhancement-evaluation" element={<BaselineVsEnhancedPage run={run} />} />
          <Route path="/longitudinal-follow-up" element={<LongitudinalProgressionPage run={run} />} />
          <Route path="/clusters" element={<LegacyRouteRedirect to="/cluster-findings" />} />
          <Route path="/baseline-vs-enhanced" element={<LegacyRouteRedirect to="/enhancement-evaluation" />} />
          <Route path="/longitudinal" element={<LegacyRouteRedirect to="/longitudinal-follow-up" />} />
          <Route path="/data-preparation" element={<Navigate to="/enhanced-kmeans#data-preparation" replace />} />
          <Route path="/validation" element={<Navigate to="/longitudinal-follow-up#validation-limitations" replace />} />
          <Route path="/upload-run" element={<UploadAndCluster />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
