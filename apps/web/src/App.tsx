import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useRunData } from "./hooks/useRunData";
import { ClusterProfilesPage } from "./pages/ClusterProfilesPage";
import { ComparisonPage } from "./pages/ComparisonPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DpcInitPage } from "./pages/DpcInitPage";
import { NbClustPage } from "./pages/NbClustPage";
import { PcaPage } from "./pages/PcaPage";
import { PreprocessingPage } from "./pages/PreprocessingPage";
import { RunLinkedPage } from "./pages/RunLinkedPage";
import { UploadAndCluster } from "./pages/UploadAndCluster";

export default function App() {
  const runState = useRunData();

  return (
    <AppShell {...runState}>
      <Routes>
        <Route path="/" element={<Navigate to="/upload-cluster" replace />} />
        <Route path="/dashboard" element={<DashboardPage run={runState.selectedRun} />} />
        <Route path="/preprocessing" element={<PreprocessingPage run={runState.selectedRun} />} />
        <Route path="/pca" element={<PcaPage run={runState.selectedRun} />} />
        <Route path="/nbclust" element={<NbClustPage run={runState.selectedRun} />} />
        <Route path="/dpc-init" element={<DpcInitPage run={runState.selectedRun} />} />
        <Route path="/comparison" element={<ComparisonPage run={runState.selectedRun} />} />
        <Route path="/cluster-profiles" element={<ClusterProfilesPage run={runState.selectedRun} />} />
        <Route path="/upload-cluster" element={<UploadAndCluster />} />
        <Route
          path="/runs/:runId/comparison"
          element={
            <RunLinkedPage
              runs={runState.runs}
              isLoading={runState.isLoading}
              error={runState.error}
              selectRunById={runState.selectRunById}
            >
              {(run) => <ComparisonPage run={run} />}
            </RunLinkedPage>
          }
        />
        <Route
          path="/runs/:runId/cluster-profiles"
          element={
            <RunLinkedPage
              runs={runState.runs}
              isLoading={runState.isLoading}
              error={runState.error}
              selectRunById={runState.selectRunById}
            >
              {(run) => <ClusterProfilesPage run={run} />}
            </RunLinkedPage>
          }
        />
        <Route path="*" element={<Navigate to="/upload-cluster" replace />} />
      </Routes>
    </AppShell>
  );
}
