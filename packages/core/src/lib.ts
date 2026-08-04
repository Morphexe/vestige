/**
 * Vestige Library Exports
 *
 * This is the main entry point for using Vestige as an importable library.
 * For MCP server mode, use the default export from the package.
 *
 * @example Library Usage
 * ```typescript
 * import { createVestige } from '@morphexe/vestige-core/lib';
 *
 * const memory = await createVestige({
 *   supabase: {
 *     url: process.env.SUPABASE_URL!,
 *     serviceKey: process.env.SUPABASE_SERVICE_KEY!,
 *   },
 *   openai: {
 *     apiKey: process.env.OPENAI_API_KEY!,
 *   },
 *   agentId: 'my-agent',
 * });
 *
 * // Store and recall memories
 * const id = await memory.remember("Important fact");
 * const results = await memory.recall("facts");
 * await memory.reinforce(id, 'good');
 *
 * // Cleanup
 * await memory.close();
 * ```
 */

// =============================================================================
// LIBRARY API
// =============================================================================

// Main library entry point
export {
  createVestige,
  type VestigeLibraryConfig,
  type VestigeMemory,
  type Memory,
  type RememberOptions,
  type RecallOptions,
  type ReinforceRating,
} from './vestige.js';

// =============================================================================
// CORE MODULES
// =============================================================================

// Configuration
export {
  createConfig,
  setConfig,
  getConfig,
  resetConfig,
  validateConfig,
  type VestigeConfig,
} from './core/config.js';

// Embeddings
export {
  createEmbeddingService,
  cosineSimilarity,
  normalizedSimilarity,
  findTopK,
  filterBySimilarity,
  averageEmbedding,
  OllamaEmbeddingService,
  FallbackEmbeddingService,
  EmbeddingCache,
  type EmbeddingService,
  type EmbeddingServiceConfig,
} from './core/embeddings.js';

// FSRS (Spaced Repetition)
export {
  FSRSScheduler,
  Grade,
  FSRS_WEIGHTS,
  FSRS_CONSTANTS,
  type FSRSState,
  type ReviewGrade,
  type ReviewResult,
  type LearningState,
} from './core/fsrs.js';

// Types
export {
  type KnowledgeNode,
  type KnowledgeNodeInput,
  type PersonNode,
  type GraphEdge,
  type SourceType,
  type SourcePlatform,
  type EdgeType,
} from './core/types.js';

// Errors
export {
  VestigeError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  ConfigurationError,
  EmbeddingError,
  isVestigeError,
  toVestigeError,
} from './core/errors.js';

// =============================================================================
// ADAPTERS
// =============================================================================

// OpenAI Embeddings
export {
  OpenAIEmbeddingService,
  createOpenAIEmbeddingService,
  type OpenAIEmbeddingConfig,
} from './adapters/openai-embeddings.js';

// Database adapters
export {
  type DatabaseAdapter,
  type QueryResult,
  type TransactionScope,
} from './adapters/database-adapter.js';

// Turso adapter (for edge deployments)
export {
  TursoAdapter,
  createTursoAdapter,
  type TursoConfig,
} from './adapters/turso-adapter.js';

// HTTP server adapter
export {
  createVestigeHttpServer,
  type VestigeHttpServer,
  type VestigeHttpServerConfig,
} from './adapters/http-server.js';

// =============================================================================
// CODEBASE MODULE
// =============================================================================

// Context capture
export {
  ContextCapture,
  ProjectType,
  Framework,
  getProjectExtensions,
  getLanguageName,
  getFrameworkName,
  type GitContextInfo,
  type WorkingContext,
  type FileContext,
  type ContextCaptureOptions,
  type DetectionStrategy,
  type DetectionResult,
} from './codebase/index.js';
