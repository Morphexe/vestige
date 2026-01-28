/**
 * MCP Tools Module
 *
 * Unified exports for all MCP tools.
 */

// Codebase Tool
export {
  CodebaseInputSchema,
  type CodebaseInput,
  codebaseToolDefinition,
  executeCodebase,
} from './codebase.js';

// Intention Tool
export {
  IntentionInputSchema,
  type IntentionInput,
  type IntentionRecord,
  intentionToolDefinition,
  executeIntention,
} from './intention.js';

// Feedback Tools
export {
  PromoteMemoryInputSchema,
  DemoteMemoryInputSchema,
  RequestFeedbackInputSchema,
  type PromoteMemoryInput,
  type DemoteMemoryInput,
  type RequestFeedbackInput,
  promoteMemoryToolDefinition,
  demoteMemoryToolDefinition,
  requestFeedbackToolDefinition,
  executePromoteMemory,
  executeDemoteMemory,
  executeRequestFeedback,
} from './feedback.js';

// Smart Ingest Tool
export {
  SmartIngestInputSchema,
  type SmartIngestInput,
  type SmartIngestResult,
  smartIngestToolDefinition,
  executeSmartIngest,
} from './smart-ingest.js';

// Search Tool
export {
  SearchInputSchema,
  type SearchInput,
  type SearchResultItem,
  type SearchOutput,
  searchToolDefinition,
  executeSearch,
} from './search.js';

// Recall Tool
export {
  RecallInputSchema,
  type RecallInput,
  type RecallResultItem,
  type RecallOutput,
  recallToolDefinition,
  executeRecall,
} from './recall.js';

// Review Tool
export {
  ReviewInputSchema,
  type ReviewInput,
  type FSRSMetrics,
  type ReviewOutput,
  reviewToolDefinition,
  executeReview,
} from './review.js';

// Stats Tool
export {
  StatsInputSchema,
  type StatsInput,
  type HealthStatus,
  type RetentionDistribution,
  type SourceDistribution,
  type StatsOutput,
  statsToolDefinition,
  executeStats,
} from './stats.js';

// Consolidate Tool
export {
  ConsolidateInputSchema,
  type ConsolidateInput,
  type ConsolidateOutput,
  consolidateToolDefinition,
  executeConsolidate,
} from './consolidate.js';

// Context Tool
export {
  ContextInputSchema,
  type ContextInput,
  type ContextResultItem,
  type ContextOutput,
  contextToolDefinition,
  executeContext,
} from './context.js';

// Knowledge Tool
export {
  GetKnowledgeInputSchema,
  DeleteKnowledgeInputSchema,
  type GetKnowledgeInput,
  type DeleteKnowledgeInput,
  type KnowledgeNodeDetail,
  type GetKnowledgeOutput,
  type DeleteKnowledgeOutput,
  getKnowledgeToolDefinition,
  deleteKnowledgeToolDefinition,
  executeGetKnowledge,
  executeDeleteKnowledge,
} from './knowledge.js';

// Memory States Tool
export {
  GetMemoryStateInputSchema,
  ListByStateInputSchema,
  StateStatsInputSchema,
  type GetMemoryStateInput,
  type ListByStateInput,
  type StateStatsInput,
  type MemoryState,
  type MemoryStateInfo,
  type GetMemoryStateOutput,
  type ListByStateOutput,
  type StateStatsOutput,
  STATE_THRESHOLDS,
  STATE_ACCESSIBILITY,
  getStateFromRetention,
  getStateDescription,
  getMemoryStateToolDefinition,
  listByStateToolDefinition,
  stateStatsToolDefinition,
  executeGetMemoryState,
  executeListByState,
  executeStateStats,
} from './memory-states.js';

// Tagging Tool
export {
  TriggerImportanceInputSchema,
  FindTaggedInputSchema,
  TagStatsInputSchema,
  type TriggerImportanceInput,
  type FindTaggedInput,
  type TagStatsInput,
  type ImportanceEventType,
  type TaggedMemory,
  type TriggerImportanceOutput,
  type FindTaggedOutput,
  type TagStatsOutput,
  triggerImportanceToolDefinition,
  findTaggedToolDefinition,
  tagStatsToolDefinition,
  executeTriggerImportance,
  executeFindTagged,
  executeTagStats,
} from './tagging.js';
