/**
 * Codebase Memory Module
 *
 * This module provides codebase-specific memory capabilities:
 * - Architectural decisions and their rationale
 * - Bug fixes with root cause analysis
 * - Code patterns and when to use them
 * - File relationships (imports, co-changes, tests)
 * - Coding preferences and style
 * - Code entities (functions, types, modules)
 * - Work context for session continuity
 *
 * This is Vestige's killer differentiator - no other AI memory system
 * understands codebases at this level.
 */

// Types
export {
  // Enums
  DecisionStatus,
  BugSeverity,
  RelationType,
  RelationshipSource,
  PreferenceSource,
  EntityType,
  WorkStatus,
  // Interfaces
  type ArchitecturalDecision,
  type BugFix,
  type CodePattern,
  type FileRelationship,
  type CodingPreference,
  type CodeEntity,
  type WorkContext,
  type CodebaseNode,
  type CodebaseNodeType,
  // Factory functions
  createArchitecturalDecision,
  createBugFix,
  createCodePattern,
  createFileRelationship,
  createGitCochangeRelationship,
  createCodingPreference,
  createCodeEntity,
  createWorkContext,
  // Node utilities
  getNodeId,
  getNodeCreatedAt,
  getNodeFiles,
  nodeToSearchableText,
} from './types.js';

// Context
export {
  // Enums
  ProjectType,
  Framework,
  // Functions
  getProjectExtensions,
  getLanguageName,
  getFrameworkName,
  // Interfaces
  type GitContextInfo,
  type WorkingContext,
  type FileContext,
  // Classes
  ContextCapture,
} from './context.js';

// Patterns
export {
  // Interfaces
  type PatternLocation,
  type PatternMatch,
  type PatternSuggestion,
  // Classes
  PatternDetector,
  // Functions
  createBuiltinPatterns,
} from './patterns.js';

// Relationships
export {
  // Interfaces
  type RelatedFile,
  type GraphNode,
  type GraphEdge,
  type GraphMetadata,
  type RelationshipGraph,
  // Classes
  RelationshipTracker,
} from './relationships.js';

// Git Analysis
export {
  // Interfaces
  type CommitInfo,
  type GitContext,
  type HistoryAnalysis,
  // Classes
  GitAnalyzer,
} from './git.js';

// File Watcher
export {
  // Constants
  DEFAULT_WATCHER_CONFIG,
  EXTENSION_LANGUAGE_MAP,
  // Types
  type FileEventKind,
  type FileEvent,
  type WatcherConfig,
  type EditSession,
  type LanguageInfo,
  // Functions
  detectLanguage,
  shouldIgnore,
  hasWatchedExtension,
  createFileWatcher,
  // Classes
  FileWatcher,
} from './watcher.js';
