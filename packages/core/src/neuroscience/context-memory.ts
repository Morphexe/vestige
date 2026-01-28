/**
 * Context Memory Module
 *
 * Implements encoding specificity principle:
 * - Memories are more accessible when retrieval context matches encoding context
 * - Captures and stores context at encoding time
 * - Provides context matching for improved retrieval
 *
 * Based on:
 * - Tulving & Thomson (1973) - Encoding specificity principle
 */

import { nanoid } from 'nanoid';

/** Project/language types */
export enum ProjectType {
  Rust = 'rust',
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
  Go = 'go',
  Java = 'java',
  Kotlin = 'kotlin',
  Swift = 'swift',
  CSharp = 'csharp',
  Cpp = 'cpp',
  Ruby = 'ruby',
  Php = 'php',
  Mixed = 'mixed',
  Unknown = 'unknown',
}

/** Detected frameworks */
export enum Framework {
  // Rust
  Tauri = 'tauri',
  Actix = 'actix',
  Axum = 'axum',
  Rocket = 'rocket',
  Tokio = 'tokio',
  Diesel = 'diesel',
  SeaORM = 'sea_orm',

  // JavaScript/TypeScript
  React = 'react',
  Vue = 'vue',
  Angular = 'angular',
  Svelte = 'svelte',
  NextJS = 'next_js',
  NuxtJS = 'nuxt_js',
  Express = 'express',
  NestJS = 'nest_js',
  Deno = 'deno',
  Bun = 'bun',

  // Python
  Django = 'django',
  Flask = 'flask',
  FastAPI = 'fastapi',
  Pytest = 'pytest',
  Poetry = 'poetry',

  // Other
  Spring = 'spring',
  Rails = 'rails',
  Laravel = 'laravel',
  DotNet = 'dotnet',

  Unknown = 'unknown',
}

/** Git context information */
export interface GitContext {
  currentBranch: string | null;
  headCommit: string | null;
  uncommittedChanges: string[];
  stagedChanges: string[];
  hasUncommitted: boolean;
  isClean: boolean;
}

/** File context information */
export interface FileContext {
  path: string;
  language: ProjectType;
  extension: string;
  directory: string;
  relatedFiles: string[];
  hasChanges: boolean;
  lastModified: Date | null;
  isTestFile: boolean;
  module: string | null;
}

/** Full working context snapshot */
export interface WorkingContext {
  id: string;
  git: GitContext | null;
  activeFile: FileContext | null;
  projectType: ProjectType;
  frameworks: Framework[];
  projectName: string | null;
  projectRoot: string;
  capturedAt: Date;
  recentFiles: string[];
  configFiles: string[];
}

/** Context similarity result */
export interface ContextSimilarity {
  overall: number;
  projectMatch: boolean;
  frameworkMatch: number;
  branchMatch: boolean;
  fileProximity: number;
  temporalProximity: number;
}

/** Encoding context stored with memory */
export interface EncodingContext {
  memoryId: string;
  workingContext: WorkingContext;
  keywords: string[];
  topics: string[];
  timestamp: Date;
}

/**
 * Detect project type from file extension
 */
export function detectProjectType(extension: string): ProjectType {
  const ext = extension.toLowerCase().replace('.', '');

  const mapping: Record<string, ProjectType> = {
    rs: ProjectType.Rust,
    ts: ProjectType.TypeScript,
    tsx: ProjectType.TypeScript,
    js: ProjectType.JavaScript,
    jsx: ProjectType.JavaScript,
    mjs: ProjectType.JavaScript,
    cjs: ProjectType.JavaScript,
    py: ProjectType.Python,
    go: ProjectType.Go,
    java: ProjectType.Java,
    kt: ProjectType.Kotlin,
    kts: ProjectType.Kotlin,
    swift: ProjectType.Swift,
    cs: ProjectType.CSharp,
    cpp: ProjectType.Cpp,
    cc: ProjectType.Cpp,
    cxx: ProjectType.Cpp,
    c: ProjectType.Cpp,
    h: ProjectType.Cpp,
    hpp: ProjectType.Cpp,
    rb: ProjectType.Ruby,
    php: ProjectType.Php,
  };

  return mapping[ext] ?? ProjectType.Unknown;
}

/**
 * Get file extensions for a project type
 */
export function getExtensions(projectType: ProjectType): string[] {
  const mapping: Record<ProjectType, string[]> = {
    [ProjectType.Rust]: ['.rs'],
    [ProjectType.TypeScript]: ['.ts', '.tsx', '.mts', '.cts'],
    [ProjectType.JavaScript]: ['.js', '.jsx', '.mjs', '.cjs'],
    [ProjectType.Python]: ['.py', '.pyi', '.pyw'],
    [ProjectType.Go]: ['.go'],
    [ProjectType.Java]: ['.java'],
    [ProjectType.Kotlin]: ['.kt', '.kts'],
    [ProjectType.Swift]: ['.swift'],
    [ProjectType.CSharp]: ['.cs'],
    [ProjectType.Cpp]: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp'],
    [ProjectType.Ruby]: ['.rb'],
    [ProjectType.Php]: ['.php'],
    [ProjectType.Mixed]: [],
    [ProjectType.Unknown]: [],
  };

  return mapping[projectType] ?? [];
}

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const path = filePath.toLowerCase();

  // Check directory patterns
  const testDirs = ['/tests/', '/test/', '/__tests__/', '/spec/', '/_tests/'];
  if (testDirs.some(dir => path.includes(dir))) {
    return true;
  }

  // Check file name patterns
  const testPatterns = [
    '.test.',
    '.spec.',
    '_test.',
    '_spec.',
    'test_',
    'spec_',
  ];
  return testPatterns.some(pattern => path.includes(pattern));
}

/**
 * Extract module/package name from file path
 */
export function extractModule(filePath: string, projectType: ProjectType): string | null {
  const parts = filePath.split('/').filter(p => p && p !== 'src');

  if (parts.length < 2) return null;

  // Remove file name
  parts.pop();

  switch (projectType) {
    case ProjectType.Rust:
      // Rust: src/module/file.rs → module::
      return parts.join('::');

    case ProjectType.TypeScript:
    case ProjectType.JavaScript:
      // JS/TS: src/module/file.ts → module.
      return parts.join('.');

    case ProjectType.Python:
      // Python: src/module/file.py → module.
      return parts.join('.');

    case ProjectType.Go:
      // Go uses package name from file, not path
      return parts[parts.length - 1] ?? null;

    default:
      return parts.join('/');
  }
}

/**
 * Create a file context
 */
export function createFileContext(
  filePath: string,
  hasChanges: boolean = false,
  relatedFiles: string[] = []
): FileContext {
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1] ?? '';
  const extMatch = fileName.match(/\.([^.]+)$/);
  const extension = extMatch ? extMatch[1]! : '';
  const directory = parts.slice(0, -1).join('/');
  const language = detectProjectType(extension);

  return {
    path: filePath,
    language,
    extension,
    directory,
    relatedFiles,
    hasChanges,
    lastModified: null,
    isTestFile: isTestFile(filePath),
    module: extractModule(filePath, language),
  };
}

/**
 * Create a working context snapshot
 */
export function createWorkingContext(
  projectRoot: string,
  projectType: ProjectType = ProjectType.Unknown,
  options?: {
    git?: GitContext | null;
    activeFile?: FileContext | null;
    frameworks?: Framework[];
    projectName?: string | null;
    recentFiles?: string[];
    configFiles?: string[];
  }
): WorkingContext {
  return {
    id: nanoid(),
    git: options?.git ?? null,
    activeFile: options?.activeFile ?? null,
    projectType,
    frameworks: options?.frameworks ?? [],
    projectName: options?.projectName ?? null,
    projectRoot,
    capturedAt: new Date(),
    recentFiles: options?.recentFiles ?? [],
    configFiles: options?.configFiles ?? [],
  };
}

/**
 * Calculate context similarity between two contexts
 */
export function calculateContextSimilarity(
  encodingContext: WorkingContext,
  retrievalContext: WorkingContext
): ContextSimilarity {
  let overall = 0;
  let factors = 0;

  // Project type match (25% weight)
  const projectMatch = encodingContext.projectType === retrievalContext.projectType;
  if (projectMatch) {
    overall += 0.25;
  }
  factors++;

  // Framework overlap (20% weight)
  const encodingFrameworks = new Set(encodingContext.frameworks);
  const retrievalFrameworks = new Set(retrievalContext.frameworks);
  let frameworkOverlap = 0;
  if (encodingFrameworks.size > 0 && retrievalFrameworks.size > 0) {
    const intersection = [...encodingFrameworks].filter(f => retrievalFrameworks.has(f));
    const union = new Set([...encodingFrameworks, ...retrievalFrameworks]);
    frameworkOverlap = intersection.length / union.size;
    overall += 0.20 * frameworkOverlap;
  } else if (encodingFrameworks.size === 0 && retrievalFrameworks.size === 0) {
    frameworkOverlap = 1;
    overall += 0.20;
  }
  factors++;

  // Git branch match (15% weight)
  const branchMatch =
    encodingContext.git?.currentBranch === retrievalContext.git?.currentBranch &&
    encodingContext.git?.currentBranch !== null;
  if (branchMatch) {
    overall += 0.15;
  }
  factors++;

  // File proximity (25% weight)
  let fileProximity = 0;
  if (encodingContext.activeFile && retrievalContext.activeFile) {
    // Same directory = high proximity
    if (encodingContext.activeFile.directory === retrievalContext.activeFile.directory) {
      fileProximity = 1.0;
    }
    // Same module = medium proximity
    else if (
      encodingContext.activeFile.module &&
      encodingContext.activeFile.module === retrievalContext.activeFile.module
    ) {
      fileProximity = 0.7;
    }
    // Related files = some proximity
    else if (
      encodingContext.activeFile.relatedFiles.includes(retrievalContext.activeFile.path) ||
      retrievalContext.activeFile.relatedFiles.includes(encodingContext.activeFile.path)
    ) {
      fileProximity = 0.5;
    }
    // Same project type = minimal proximity
    else if (encodingContext.activeFile.language === retrievalContext.activeFile.language) {
      fileProximity = 0.2;
    }
  }
  overall += 0.25 * fileProximity;
  factors++;

  // Temporal proximity (15% weight)
  const hoursDiff = Math.abs(
    encodingContext.capturedAt.getTime() - retrievalContext.capturedAt.getTime()
  ) / (1000 * 60 * 60);
  // 1.0 within 1 hour, decays with half-life of 24 hours
  const temporalProximity = Math.pow(0.5, hoursDiff / 24);
  overall += 0.15 * temporalProximity;
  factors++;

  return {
    overall,
    projectMatch,
    frameworkMatch: frameworkOverlap,
    branchMatch,
    fileProximity,
    temporalProximity,
  };
}

/**
 * Context Memory Store
 *
 * Stores and retrieves encoding contexts for memories
 */
export class ContextMemoryStore {
  private contexts: Map<string, EncodingContext> = new Map();

  /**
   * Store encoding context for a memory
   */
  store(
    memoryId: string,
    workingContext: WorkingContext,
    keywords: string[] = [],
    topics: string[] = []
  ): EncodingContext {
    const context: EncodingContext = {
      memoryId,
      workingContext,
      keywords,
      topics,
      timestamp: new Date(),
    };
    this.contexts.set(memoryId, context);
    return context;
  }

  /**
   * Get encoding context for a memory
   */
  get(memoryId: string): EncodingContext | null {
    return this.contexts.get(memoryId) ?? null;
  }

  /**
   * Find memories with similar context
   */
  findSimilar(
    retrievalContext: WorkingContext,
    minSimilarity: number = 0.3
  ): Array<{ memoryId: string; similarity: ContextSimilarity }> {
    const results: Array<{ memoryId: string; similarity: ContextSimilarity }> = [];

    for (const [memoryId, encoding] of this.contexts) {
      const similarity = calculateContextSimilarity(encoding.workingContext, retrievalContext);
      if (similarity.overall >= minSimilarity) {
        results.push({ memoryId, similarity });
      }
    }

    // Sort by overall similarity
    results.sort((a, b) => b.similarity.overall - a.similarity.overall);
    return results;
  }

  /**
   * Find memories by keyword
   */
  findByKeyword(keyword: string): string[] {
    const lowerKeyword = keyword.toLowerCase();
    const results: string[] = [];

    for (const [memoryId, context] of this.contexts) {
      if (context.keywords.some(k => k.toLowerCase().includes(lowerKeyword))) {
        results.push(memoryId);
      }
    }

    return results;
  }

  /**
   * Find memories by topic
   */
  findByTopic(topic: string): string[] {
    const lowerTopic = topic.toLowerCase();
    const results: string[] = [];

    for (const [memoryId, context] of this.contexts) {
      if (context.topics.some(t => t.toLowerCase().includes(lowerTopic))) {
        results.push(memoryId);
      }
    }

    return results;
  }

  /**
   * Update keywords for a memory
   */
  addKeywords(memoryId: string, keywords: string[]): boolean {
    const context = this.contexts.get(memoryId);
    if (!context) return false;

    const uniqueKeywords = [...new Set([...context.keywords, ...keywords])];
    this.contexts.set(memoryId, {
      ...context,
      keywords: uniqueKeywords,
    });

    return true;
  }

  /**
   * Update topics for a memory
   */
  addTopics(memoryId: string, topics: string[]): boolean {
    const context = this.contexts.get(memoryId);
    if (!context) return false;

    const uniqueTopics = [...new Set([...context.topics, ...topics])];
    this.contexts.set(memoryId, {
      ...context,
      topics: uniqueTopics,
    });

    return true;
  }

  /**
   * Remove a memory's context
   */
  remove(memoryId: string): boolean {
    return this.contexts.delete(memoryId);
  }

  /**
   * Get all stored contexts
   */
  getAll(): EncodingContext[] {
    return Array.from(this.contexts.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalContexts: number;
    avgKeywordsPerContext: number;
    avgTopicsPerContext: number;
    projectTypeDistribution: Record<string, number>;
  } {
    const contexts = Array.from(this.contexts.values());
    const totalContexts = contexts.length;

    if (totalContexts === 0) {
      return {
        totalContexts: 0,
        avgKeywordsPerContext: 0,
        avgTopicsPerContext: 0,
        projectTypeDistribution: {},
      };
    }

    const totalKeywords = contexts.reduce((sum, c) => sum + c.keywords.length, 0);
    const totalTopics = contexts.reduce((sum, c) => sum + c.topics.length, 0);

    const projectTypeDistribution: Record<string, number> = {};
    for (const context of contexts) {
      const type = context.workingContext.projectType;
      projectTypeDistribution[type] = (projectTypeDistribution[type] ?? 0) + 1;
    }

    return {
      totalContexts,
      avgKeywordsPerContext: totalKeywords / totalContexts,
      avgTopicsPerContext: totalTopics / totalContexts,
      projectTypeDistribution,
    };
  }

  /**
   * Clear all contexts
   */
  clear(): void {
    this.contexts.clear();
  }
}

/**
 * Boost search results based on context similarity
 */
export function boostByContext<T extends { memoryId: string; score: number }>(
  results: T[],
  retrievalContext: WorkingContext,
  contextStore: ContextMemoryStore,
  maxBoost: number = 0.3
): T[] {
  return results.map(result => {
    const encoding = contextStore.get(result.memoryId);
    if (!encoding) return result;

    const similarity = calculateContextSimilarity(encoding.workingContext, retrievalContext);
    const boost = similarity.overall * maxBoost;

    return {
      ...result,
      score: result.score * (1 + boost),
    };
  }).sort((a, b) => b.score - a.score);
}
