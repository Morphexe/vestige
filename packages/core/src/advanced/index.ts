/**
 * Advanced Features Module
 *
 * Higher-level cognitive features building on neuroscience foundations:
 * - Dreams & Consolidation (memory replay during idle)
 * - Reconsolidation (memory modification on retrieval)
 * - Prediction Error Gating (novelty-based storage decisions)
 * - Memory Chains (temporal/causal sequences)
 * - Semantic Compression (space-efficient storage)
 * - Intent Detection (understanding user goals)
 * - Adaptive Embedding (content-aware embeddings)
 * - Speculative Retrieval (predictive prefetching)
 * - Cross-Project Learning (universal patterns)
 */

// Dreams & Consolidation
export {
  ConsolidationPhase,
  InsightType,
  DEFAULT_CONSOLIDATION_CONFIG,
  type MemoryReplay,
  type ConsolidationInsight,
  type ConsolidationResult,
  type ConsolidationConfig,
  type ConsolidationCandidate,
  selectForConsolidation,
  detectPatterns,
  findPotentialConnections,
  generateInsights,
  ConsolidationEngine,
  calculateOptimalConsolidationTime,
} from './dreams.js';

// Reconsolidation
export {
  DEFAULT_LABILE_WINDOW_MS,
  MAX_MODIFICATIONS_PER_WINDOW,
  RETRIEVAL_HISTORY_DAYS,
  RelationshipType,
  AccessTrigger,
  type MemorySnapshot,
  type Modification,
  type LabileState,
  type AppliedModification,
  type ChangeSummary,
  type ReconsolidatedMemory,
  type RetrievalRecord,
  type AccessContext,
  type ReconsolidationStats,
  createSnapshot,
  createLabileState,
  isWithinWindow,
  hasChanges,
  getModificationDescription,
  ReconsolidationManager,
} from './reconsolidation.js';

// Prediction Error Gating
export {
  DEFAULT_DUPLICATE_THRESHOLD,
  DEFAULT_UPDATE_THRESHOLD,
  DEFAULT_MERGE_THRESHOLD,
  MIN_MEMORIES_FOR_MERGE,
  GateDecision,
  ContradictionType,
  ActionType as GateActionType,
  DEFAULT_GATE_CONFIG,
  type DecisionReason,
  type ExistingMemory,
  type IncomingContent,
  type SimilarityResult,
  type GateResult,
  type SuggestedAction,
  type GateConfig,
  createDecisionReason,
  cosineSimilarity,
  textSimilarity,
  detectContradiction,
  calculatePredictionError,
  PredictionErrorGate,
} from './prediction-error.js';

// Memory Chains
export {
  ChainType,
  LinkType as ChainLinkType,
  type ChainLink,
  type MemoryChain,
  createLink,
  createChain,
  getDefaultLinkType,
  ChainManager,
} from './chains.js';

// Semantic Compression
export {
  CompressionStrategy,
  CompressionLevel,
  DEFAULT_COMPRESSION_CONFIG,
  type CompressionCandidate,
  type CompressionResult,
  type CompressionConfig,
  getTargetRatio,
  extractKeywords,
  simpleSummarize,
  findOverlap,
  mergeContent,
  CompressionEngine,
} from './compression.js';

// Intent Detection
export {
  MAX_ACTION_HISTORY,
  INTENT_WINDOW_MINUTES,
  MIN_INTENT_CONFIDENCE,
  ActionType,
  MaintenanceType,
  LearningLevel,
  ReviewDepth,
  OptimizationType,
  type DetectedIntent,
  type UserAction,
  type IntentDetectionResult,
  type IntentMemoryQuery,
  getIntentDescription,
  getIntentRelevantTags,
  createAction,
  fileOpened,
  fileEdited,
  search,
  errorEncountered,
  commandExecuted,
  docsViewed,
  IntentDetector,
} from './intent.js';

// Adaptive Embedding
export {
  DEFAULT_DIMENSIONS,
  CODE_DIMENSIONS,
  Language,
  ContentType,
  EmbeddingStrategy,
  type ContentAnalysis,
  type EmbeddingResult,
  languageFromExtension,
  getLanguageKeywords,
  getStrategyDimensions,
  analyzeContent,
  detectContentType,
  AdaptiveEmbedder,
} from './adaptive-embedding.js';

// Speculative Retrieval
export {
  MAX_PATTERN_HISTORY,
  MAX_PREDICTIONS,
  MIN_CONFIDENCE,
  PATTERN_DECAY_RATE,
  type PredictionTrigger,
  type PredictedMemory,
  type PredictionContext,
  type UsagePattern,
  type AccessEvent,
  createPredictionContext,
  SpeculativeRetriever,
} from './speculative.js';

// Cross-Project Learning
export {
  MIN_PROJECTS_FOR_UNIVERSAL,
  MIN_SUCCESS_RATE,
  PatternCategory,
  TriggerType,
  type PatternTrigger,
  type CodePattern,
  type UniversalPattern,
  type ApplicableKnowledge,
  type Suggestion,
  type ProjectContext,
  type MemoryForLearning,
  createProjectContext,
  CrossProjectLearner,
} from './cross-project.js';
