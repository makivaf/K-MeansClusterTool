// Retain the historical validation entry point without duplicating the current UI contract suite.
// The suite uses the real runtime validation cache and tests configuration, progress and stale results.
import { createRequire } from "node:module";
createRequire(import.meta.url)("../../../web/src/pages/SimulationRunsPage.validation.cjs");
