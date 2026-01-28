/**
 * Codebase-specific memory types for Vestige
 *
 * This module defines the specialized node types that make Vestige's codebase memory
 * unique and powerful. These types capture the contextual knowledge that developers
 * accumulate but traditionally lose - architectural decisions, bug fixes, coding
 * patterns, and file relationships.
 *
 * This is Vestige's KILLER DIFFERENTIATOR. No other AI memory system understands
 * codebases at this level.
 */

import { nanoid } from 'nanoid';

// ============================================================================
// ARCHITECTURAL DECISION
// ============================================================================

/** Status of an architectural decision */
export enum DecisionStatus {
  /** Decision is proposed but not yet implemented */
  Proposed = 'proposed',
  /** Decision is accepted and being implemented */
  Accepted = 'accepted',
  /** Decision has been superseded by another */
  Superseded = 'superseded',
  /** Decision was rejected/deprecated */
  Deprecated = 'deprecated',
}

/**
 * Records an architectural decision with its rationale.
 *
 * Example:
 * - Decision: "Use Event Sourcing for order management"
 * - Rationale: "Need complete audit trail and ability to replay state"
 * - Files: ["src/orders/events.ts", "src/orders/aggregate.ts"]
 */
export interface ArchitecturalDecision {
  id: string;
  /** The decision that was made */
  decision: string;
  /** Why this decision was made */
  rationale: string;
  /** Files affected by this decision */
  filesAffected: string[];
  /** Git commit SHA where this was implemented (if applicable) */
  commitSha: string | null;
  /** When this decision was recorded */
  createdAt: Date;
  /** When this decision was last updated */
  updatedAt: Date | null;
  /** Additional context or notes */
  context: string | null;
  /** Tags for categorization */
  tags: string[];
  /** Status of the decision */
  status: DecisionStatus;
  /** Alternatives that were considered */
  alternativesConsidered: string[];
}

/** Create a new architectural decision */
export function createArchitecturalDecision(
  decision: string,
  rationale: string,
  options?: {
    filesAffected?: string[];
    commitSha?: string;
    context?: string;
    tags?: string[];
    status?: DecisionStatus;
    alternativesConsidered?: string[];
  }
): ArchitecturalDecision {
  return {
    id: nanoid(),
    decision,
    rationale,
    filesAffected: options?.filesAffected ?? [],
    commitSha: options?.commitSha ?? null,
    createdAt: new Date(),
    updatedAt: null,
    context: options?.context ?? null,
    tags: options?.tags ?? [],
    status: options?.status ?? DecisionStatus.Accepted,
    alternativesConsidered: options?.alternativesConsidered ?? [],
  };
}

// ============================================================================
// BUG FIX
// ============================================================================

/** Severity level of a bug */
export enum BugSeverity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
  Trivial = 'trivial',
}

/**
 * Records a bug fix with root cause analysis.
 *
 * This is invaluable for:
 * - Preventing regressions
 * - Understanding why certain code exists
 * - Training junior developers on common pitfalls
 */
export interface BugFix {
  id: string;
  /** What symptoms was the bug causing? */
  symptom: string;
  /** What was the actual root cause? */
  rootCause: string;
  /** How was it fixed? */
  solution: string;
  /** Files that were changed to fix the bug */
  filesChanged: string[];
  /** Git commit SHA of the fix */
  commitSha: string;
  /** When the fix was recorded */
  createdAt: Date;
  /** Link to issue tracker (if applicable) */
  issueLink: string | null;
  /** Severity of the bug */
  severity: BugSeverity;
  /** How the bug was discovered */
  discoveredBy: string | null;
  /** Prevention measures (what would have caught this earlier) */
  preventionNotes: string | null;
  /** Tags for categorization */
  tags: string[];
}

/** Create a new bug fix record */
export function createBugFix(
  symptom: string,
  rootCause: string,
  solution: string,
  commitSha: string,
  options?: {
    filesChanged?: string[];
    issueLink?: string;
    severity?: BugSeverity;
    discoveredBy?: string;
    preventionNotes?: string;
    tags?: string[];
  }
): BugFix {
  return {
    id: nanoid(),
    symptom,
    rootCause,
    solution,
    filesChanged: options?.filesChanged ?? [],
    commitSha,
    createdAt: new Date(),
    issueLink: options?.issueLink ?? null,
    severity: options?.severity ?? BugSeverity.Medium,
    discoveredBy: options?.discoveredBy ?? null,
    preventionNotes: options?.preventionNotes ?? null,
    tags: options?.tags ?? [],
  };
}

// ============================================================================
// CODE PATTERN
// ============================================================================

/**
 * Records a reusable code pattern with examples and guidance.
 *
 * Patterns can be:
 * - Discovered automatically from git history
 * - Taught explicitly by the user
 * - Extracted from documentation
 */
export interface CodePattern {
  id: string;
  /** Name of the pattern (e.g., "Repository Pattern", "Error Handling") */
  name: string;
  /** Detailed description of the pattern */
  description: string;
  /** Example code showing the pattern */
  exampleCode: string;
  /** Files containing examples of this pattern */
  exampleFiles: string[];
  /** When should this pattern be used? */
  whenToUse: string;
  /** When should this pattern NOT be used? */
  whenNotToUse: string | null;
  /** Language this pattern applies to */
  language: string | null;
  /** When this pattern was recorded */
  createdAt: Date;
  /** How many times this pattern has been applied */
  usageCount: number;
  /** Tags for categorization */
  tags: string[];
  /** Related patterns */
  relatedPatterns: string[];
}

/** Create a new code pattern */
export function createCodePattern(
  name: string,
  description: string,
  whenToUse: string,
  options?: {
    exampleCode?: string;
    exampleFiles?: string[];
    whenNotToUse?: string;
    language?: string;
    tags?: string[];
    relatedPatterns?: string[];
  }
): CodePattern {
  return {
    id: nanoid(),
    name,
    description,
    exampleCode: options?.exampleCode ?? '',
    exampleFiles: options?.exampleFiles ?? [],
    whenToUse,
    whenNotToUse: options?.whenNotToUse ?? null,
    language: options?.language ?? null,
    createdAt: new Date(),
    usageCount: 0,
    tags: options?.tags ?? [],
    relatedPatterns: options?.relatedPatterns ?? [],
  };
}

// ============================================================================
// FILE RELATIONSHIP
// ============================================================================

/** Types of relationships between files */
export enum RelationType {
  /** A imports/depends on B */
  ImportsDependency = 'imports_dependency',
  /** A tests implementation in B */
  TestsImplementation = 'tests_implementation',
  /** A configures service B */
  ConfiguresService = 'configures_service',
  /** Files are in the same domain/feature area */
  SharedDomain = 'shared_domain',
  /** Files frequently change together in commits */
  FrequentCochange = 'frequent_cochange',
  /** A extends/implements B */
  ExtendsImplements = 'extends_implements',
  /** A is the interface, B is the implementation */
  InterfaceImplementation = 'interface_implementation',
  /** A and B are related through documentation */
  DocumentationReference = 'documentation_reference',
}

/** How a relationship was discovered */
export enum RelationshipSource {
  /** Detected from git history co-change analysis */
  GitCochange = 'git_cochange',
  /** Detected from import/dependency analysis */
  ImportAnalysis = 'import_analysis',
  /** Detected from AST analysis */
  AstAnalysis = 'ast_analysis',
  /** Explicitly taught by user */
  UserDefined = 'user_defined',
  /** Inferred from file naming conventions */
  NamingConvention = 'naming_convention',
}

/**
 * Tracks relationships between files in the codebase.
 *
 * Relationships can be:
 * - Discovered from imports/dependencies
 * - Detected from git co-change patterns
 * - Explicitly taught by the user
 */
export interface FileRelationship {
  id: string;
  /** The files involved in this relationship */
  files: string[];
  /** Type of relationship */
  relationshipType: RelationType;
  /** Strength of the relationship (0.0 - 1.0) */
  strength: number;
  /** Human-readable description */
  description: string;
  /** When this relationship was first detected */
  createdAt: Date;
  /** When this relationship was last confirmed */
  lastConfirmed: Date | null;
  /** How this relationship was discovered */
  source: RelationshipSource;
  /** Number of times this relationship has been observed */
  observationCount: number;
}

/** Create a new file relationship */
export function createFileRelationship(
  files: string[],
  relationshipType: RelationType,
  description: string,
  options?: {
    strength?: number;
    source?: RelationshipSource;
    observationCount?: number;
  }
): FileRelationship {
  return {
    id: nanoid(),
    files,
    relationshipType,
    strength: options?.strength ?? 0.5,
    description,
    createdAt: new Date(),
    lastConfirmed: null,
    source: options?.source ?? RelationshipSource.UserDefined,
    observationCount: options?.observationCount ?? 1,
  };
}

/** Create a file relationship from git co-change analysis */
export function createGitCochangeRelationship(
  files: string[],
  strength: number,
  count: number
): FileRelationship {
  return {
    id: nanoid(),
    files,
    relationshipType: RelationType.FrequentCochange,
    strength,
    description: `Files frequently change together (${count} co-occurrences)`,
    createdAt: new Date(),
    lastConfirmed: new Date(),
    source: RelationshipSource.GitCochange,
    observationCount: count,
  };
}

// ============================================================================
// CODING PREFERENCE
// ============================================================================

/** How a preference was learned */
export enum PreferenceSource {
  /** Explicitly stated by user */
  UserStated = 'user_stated',
  /** Inferred from code review feedback */
  CodeReview = 'code_review',
  /** Detected from coding patterns in history */
  PatternDetection = 'pattern_detection',
  /** From project configuration (e.g., rustfmt.toml) */
  ProjectConfig = 'project_config',
}

/**
 * Records a user's coding preferences for consistent suggestions.
 *
 * Examples:
 * - "For error handling, prefer Result over panic"
 * - "For naming, use snake_case for functions"
 * - "For async, prefer tokio over async-std"
 */
export interface CodingPreference {
  id: string;
  /** Context where this preference applies (e.g., "error handling", "naming") */
  context: string;
  /** The preferred approach */
  preference: string;
  /** What NOT to do (optional) */
  counterPreference: string | null;
  /** Examples showing the preference in action */
  examples: string[];
  /** Confidence in this preference (0.0 - 1.0) */
  confidence: number;
  /** When this preference was recorded */
  createdAt: Date;
  /** Language this applies to (null = all languages) */
  language: string | null;
  /** How this preference was learned */
  source: PreferenceSource;
  /** Number of times this preference has been observed */
  observationCount: number;
}

/** Create a new coding preference */
export function createCodingPreference(
  context: string,
  preference: string,
  options?: {
    counterPreference?: string;
    examples?: string[];
    confidence?: number;
    language?: string;
    source?: PreferenceSource;
  }
): CodingPreference {
  return {
    id: nanoid(),
    context,
    preference,
    counterPreference: options?.counterPreference ?? null,
    examples: options?.examples ?? [],
    confidence: Math.max(0, Math.min(1, options?.confidence ?? 0.5)),
    createdAt: new Date(),
    language: options?.language ?? null,
    source: options?.source ?? PreferenceSource.UserStated,
    observationCount: 1,
  };
}

// ============================================================================
// CODE ENTITY
// ============================================================================

/** Type of code entity */
export enum EntityType {
  Function = 'function',
  Method = 'method',
  Struct = 'struct',
  Enum = 'enum',
  Trait = 'trait',
  Interface = 'interface',
  Class = 'class',
  Module = 'module',
  Constant = 'constant',
  Variable = 'variable',
  Type = 'type',
}

/**
 * Knowledge about a specific code entity (function, type, module, etc.)
 */
export interface CodeEntity {
  id: string;
  /** Name of the entity */
  name: string;
  /** Type of entity */
  entityType: EntityType;
  /** Description of what this entity does */
  description: string;
  /** File where this entity is defined */
  filePath: string | null;
  /** Line number where entity starts */
  lineNumber: number | null;
  /** Entities that this one depends on */
  dependencies: string[];
  /** Entities that depend on this one */
  dependents: string[];
  /** When this was recorded */
  createdAt: Date;
  /** Tags for categorization */
  tags: string[];
  /** Usage notes or gotchas */
  notes: string | null;
}

/** Create a new code entity */
export function createCodeEntity(
  name: string,
  entityType: EntityType,
  description: string,
  options?: {
    filePath?: string;
    lineNumber?: number;
    dependencies?: string[];
    dependents?: string[];
    tags?: string[];
    notes?: string;
  }
): CodeEntity {
  return {
    id: nanoid(),
    name,
    entityType,
    description,
    filePath: options?.filePath ?? null,
    lineNumber: options?.lineNumber ?? null,
    dependencies: options?.dependencies ?? [],
    dependents: options?.dependents ?? [],
    createdAt: new Date(),
    tags: options?.tags ?? [],
    notes: options?.notes ?? null,
  };
}

// ============================================================================
// WORK CONTEXT
// ============================================================================

/** Status of work in progress */
export enum WorkStatus {
  /** Actively being worked on */
  InProgress = 'in_progress',
  /** Paused, will resume later */
  Paused = 'paused',
  /** Completed */
  Completed = 'completed',
  /** Blocked by something */
  Blocked = 'blocked',
  /** Abandoned */
  Abandoned = 'abandoned',
}

/**
 * Tracks the current work context for continuity across sessions.
 *
 * This allows Vestige to remember:
 * - What task the user was working on
 * - What files were being edited
 * - What the next steps were
 */
export interface WorkContext {
  id: string;
  /** Description of the current task */
  taskDescription: string;
  /** Files currently being worked on */
  activeFiles: string[];
  /** Current git branch */
  branch: string | null;
  /** Status of the work */
  status: WorkStatus;
  /** Next steps that were planned */
  nextSteps: string[];
  /** Blockers or issues encountered */
  blockers: string[];
  /** When this context was created */
  createdAt: Date;
  /** When this context was last updated */
  updatedAt: Date;
  /** Related issue/ticket IDs */
  relatedIssues: string[];
  /** Notes about the work */
  notes: string | null;
}

/** Create a new work context */
export function createWorkContext(
  taskDescription: string,
  options?: {
    activeFiles?: string[];
    branch?: string;
    status?: WorkStatus;
    nextSteps?: string[];
    blockers?: string[];
    relatedIssues?: string[];
    notes?: string;
  }
): WorkContext {
  const now = new Date();
  return {
    id: nanoid(),
    taskDescription,
    activeFiles: options?.activeFiles ?? [],
    branch: options?.branch ?? null,
    status: options?.status ?? WorkStatus.InProgress,
    nextSteps: options?.nextSteps ?? [],
    blockers: options?.blockers ?? [],
    createdAt: now,
    updatedAt: now,
    relatedIssues: options?.relatedIssues ?? [],
    notes: options?.notes ?? null,
  };
}

// ============================================================================
// CODEBASE NODE - Union Type
// ============================================================================

/** Types of codebase nodes */
export type CodebaseNodeType =
  | 'architectural_decision'
  | 'bug_fix'
  | 'code_pattern'
  | 'file_relationship'
  | 'coding_preference'
  | 'code_entity'
  | 'work_context';

/** A codebase memory node with type discriminator */
export type CodebaseNode =
  | { type: 'architectural_decision'; data: ArchitecturalDecision }
  | { type: 'bug_fix'; data: BugFix }
  | { type: 'code_pattern'; data: CodePattern }
  | { type: 'file_relationship'; data: FileRelationship }
  | { type: 'coding_preference'; data: CodingPreference }
  | { type: 'code_entity'; data: CodeEntity }
  | { type: 'work_context'; data: WorkContext };

/** Get the ID of any codebase node */
export function getNodeId(node: CodebaseNode): string {
  return node.data.id;
}

/** Get the creation timestamp of any codebase node */
export function getNodeCreatedAt(node: CodebaseNode): Date {
  return node.data.createdAt;
}

/** Get associated files for any codebase node */
export function getNodeFiles(node: CodebaseNode): string[] {
  switch (node.type) {
    case 'architectural_decision':
      return node.data.filesAffected;
    case 'bug_fix':
      return node.data.filesChanged;
    case 'code_pattern':
      return node.data.exampleFiles;
    case 'file_relationship':
      return node.data.files;
    case 'coding_preference':
      return [];
    case 'code_entity':
      return node.data.filePath ? [node.data.filePath] : [];
    case 'work_context':
      return node.data.activeFiles;
  }
}

/** Convert a codebase node to searchable text */
export function nodeToSearchableText(node: CodebaseNode): string {
  switch (node.type) {
    case 'architectural_decision':
      return `Architectural Decision: ${node.data.decision} - Rationale: ${node.data.rationale} - Context: ${node.data.context ?? ''}`;
    case 'bug_fix':
      return `Bug Fix: ${node.data.symptom} - Root Cause: ${node.data.rootCause} - Solution: ${node.data.solution}`;
    case 'code_pattern':
      return `Code Pattern: ${node.data.name} - ${node.data.description} - When to use: ${node.data.whenToUse}`;
    case 'file_relationship':
      return `File Relationship: ${node.data.files.join(', ')} - Type: ${node.data.relationshipType} - ${node.data.description}`;
    case 'coding_preference':
      return `Coding Preference (${node.data.context}): ${node.data.preference} vs ${node.data.counterPreference ?? 'N/A'}`;
    case 'code_entity':
      return `Code Entity: ${node.data.name} (${node.data.entityType}) - ${node.data.description}`;
    case 'work_context':
      return `Work Context: ${node.data.taskDescription} - ${node.data.status} - Active files: ${node.data.activeFiles.join(', ')}`;
  }
}
