/**
 * @deprecated Compatibility export for integrations compiled against the old
 * service name. Execution now always runs the single unified research pipeline.
 */
export {
  executeUnifiedResearch as executeResearchAxis,
  ResearchArtifactError,
  ResearchPersistenceError,
  type UnifiedResearchExecutionResult as ResearchAxisExecutionResult
} from "./executeUnifiedResearch";
