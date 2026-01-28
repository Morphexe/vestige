/**
 * Cross-Project Learning Module
 *
 * Learn patterns that apply across ALL projects. Vestige doesn't just remember
 * project-specific knowledge - it identifies universal patterns that make you
 * more effective everywhere.
 *
 * Pattern Types:
 * - Code Patterns: Error handling, async patterns, testing strategies
 * - Architecture Patterns: Project structures, module organization
 * - Process Patterns: Debug workflows, refactoring approaches
 * - Domain Patterns: Industry-specific knowledge that transfers
 */

import { nanoid } from 'nanoid';

/** Minimum projects a pattern must appear in to be considered universal */
export const MIN_PROJECTS_FOR_UNIVERSAL = 2;

/** Minimum success rate for pattern recommendations */
export const MIN_SUCCESS_RATE = 0.6;

/** Categories of patterns */
export enum PatternCategory {
  ErrorHandling = 'error_handling',
  AsyncConcurrency = 'async_concurrency',
  Testing = 'testing',
  Architecture = 'architecture',
  Performance = 'performance',
  Security = 'security',
  Debugging = 'debugging',
  Refactoring = 'refactoring',
  Documentation = 'documentation',
  Tooling = 'tooling',
  Custom = 'custom',
}

/** Types of triggers */
export enum TriggerType {
  FileName = 'file_name',
  CodeConstruct = 'code_construct',
  ErrorMessage = 'error_message',
  DirectoryStructure = 'directory_structure',
  Dependency = 'dependency',
  Intent = 'intent',
  Topic = 'topic',
}

/** Conditions that trigger pattern applicability */
export interface PatternTrigger {
  triggerType: TriggerType;
  value: string;
  confidence: number;
}

/** A code pattern that can be learned and applied */
export interface CodePattern {
  name: string;
  category: PatternCategory;
  description: string;
  example: string | null;
  triggers: PatternTrigger[];
  benefits: string[];
  considerations: string[];
}

/** A universal pattern found across multiple projects */
export interface UniversalPattern {
  id: string;
  pattern: CodePattern;
  projectsSeenIn: string[];
  successRate: number;
  applicability: string;
  confidence: number;
  firstSeen: Date;
  lastSeen: Date;
  applicationCount: number;
}

/** Knowledge that might apply to current context */
export interface ApplicableKnowledge {
  pattern: UniversalPattern;
  matchReason: string;
  applicabilityConfidence: number;
  suggestions: string[];
  supportingMemories: string[];
}

/** A suggestion for applying patterns */
export interface Suggestion {
  suggestion: string;
  basedOn: string;
  confidence: number;
  evidence: string[];
  priority: number;
}

/** Context about the current project */
export interface ProjectContext {
  path: string | null;
  name: string | null;
  languages: string[];
  frameworks: string[];
  fileTypes: Set<string>;
  dependencies: string[];
  structure: string[];
}

/** Create project context from path */
export function createProjectContext(path: string): ProjectContext {
  const name = path.split('/').pop() ?? null;
  return {
    path,
    name,
    languages: [],
    frameworks: [],
    fileTypes: new Set(),
    dependencies: [],
    structure: [],
  };
}

/** Memory input for learning */
export interface MemoryForLearning {
  id: string;
  content: string;
  projectName: string;
  category: PatternCategory | null;
}

/** Outcome of applying a pattern */
interface PatternOutcome {
  patternId: string;
  projectName: string;
  wasSuccessful: boolean;
  timestamp: Date;
}

/** Project memory entry */
interface ProjectMemory {
  memoryId: string;
  projectName: string;
  category: PatternCategory | null;
  wasHelpful: boolean | null;
  timestamp: Date;
}

/**
 * Cross-Project Learner
 *
 * Learns and applies patterns across multiple projects.
 */
export class CrossProjectLearner {
  private patterns = new Map<string, UniversalPattern>();
  private projectMemories: ProjectMemory[] = [];
  private outcomes: PatternOutcome[] = [];

  /**
   * Find patterns that appear in multiple projects
   */
  findUniversalPatterns(): UniversalPattern[] {
    return Array.from(this.patterns.values())
      .filter(p =>
        p.projectsSeenIn.length >= MIN_PROJECTS_FOR_UNIVERSAL &&
        p.successRate >= MIN_SUCCESS_RATE
      );
  }

  /**
   * Apply learned patterns to a new project
   */
  applyToProject(projectPath: string): Suggestion[] {
    const context = createProjectContext(projectPath);
    return this.generateSuggestions(context);
  }

  /**
   * Apply with full context
   */
  applyToContext(context: ProjectContext): Suggestion[] {
    return this.generateSuggestions(context);
  }

  /**
   * Detect when current situation matches cross-project knowledge
   */
  detectApplicable(context: ProjectContext): ApplicableKnowledge[] {
    const applicable: ApplicableKnowledge[] = [];
    const patterns = Array.from(this.patterns.values());

    for (const pattern of patterns) {
      const knowledge = this.checkPatternApplicability(pattern, context);
      if (knowledge) {
        applicable.push(knowledge);
      }
    }

    // Sort by applicability confidence
    applicable.sort((a, b) => b.applicabilityConfidence - a.applicabilityConfidence);

    return applicable;
  }

  /**
   * Record that a memory was associated with a project
   */
  recordProjectMemory(
    memoryId: string,
    projectName: string,
    category: PatternCategory | null = null
  ): void {
    this.projectMemories.push({
      memoryId,
      projectName,
      category,
      wasHelpful: null,
      timestamp: new Date(),
    });
  }

  /**
   * Record outcome of applying a pattern
   */
  recordPatternOutcome(
    patternId: string,
    projectName: string,
    wasSuccessful: boolean
  ): void {
    this.outcomes.push({
      patternId,
      projectName,
      wasSuccessful,
      timestamp: new Date(),
    });

    this.updatePatternSuccessRate(patternId);
  }

  /**
   * Add or update a pattern
   */
  addPattern(pattern: UniversalPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Learn patterns from existing memories
   */
  learnFromMemories(memories: MemoryForLearning[]): void {
    // Group memories by category
    const byCategory = new Map<PatternCategory, MemoryForLearning[]>();

    for (const memory of memories) {
      if (memory.category) {
        const existing = byCategory.get(memory.category) ?? [];
        existing.push(memory);
        byCategory.set(memory.category, existing);
      }
    }

    // Find patterns within each category
    for (const [category, catMemories] of byCategory) {
      this.extractPatternsFromCategory(category, catMemories);
    }
  }

  /**
   * Get all discovered patterns
   */
  getAllPatterns(): UniversalPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by category
   */
  getPatternsByCategory(category: PatternCategory): UniversalPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.pattern.category === category);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    universalPatterns: number;
    projectsTracked: number;
    avgSuccessRate: number;
  } {
    const patterns = Array.from(this.patterns.values());
    const universal = patterns.filter(
      p => p.projectsSeenIn.length >= MIN_PROJECTS_FOR_UNIVERSAL
    );

    const projects = new Set<string>();
    for (const p of patterns) {
      for (const proj of p.projectsSeenIn) {
        projects.add(proj);
      }
    }

    const totalSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0);

    return {
      totalPatterns: patterns.length,
      universalPatterns: universal.length,
      projectsTracked: projects.size,
      avgSuccessRate: patterns.length > 0 ? totalSuccessRate / patterns.length : 0,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.patterns.clear();
    this.projectMemories = [];
    this.outcomes = [];
  }

  // Private methods

  private generateSuggestions(context: ProjectContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const patterns = Array.from(this.patterns.values());

    for (const pattern of patterns) {
      const applicable = this.checkPatternApplicability(pattern, context);
      if (applicable) {
        for (let i = 0; i < applicable.suggestions.length; i++) {
          suggestions.push({
            suggestion: applicable.suggestions[i]!,
            basedOn: pattern.pattern.name,
            confidence: applicable.applicabilityConfidence,
            evidence: applicable.supportingMemories,
            priority: Math.floor(10 * applicable.applicabilityConfidence) - i,
          });
        }
      }
    }

    suggestions.sort((a, b) => b.priority - a.priority);
    return suggestions;
  }

  private checkPatternApplicability(
    pattern: UniversalPattern,
    context: ProjectContext
  ): ApplicableKnowledge | null {
    const matchScores: number[] = [];
    const matchReasons: string[] = [];

    for (const trigger of pattern.pattern.triggers) {
      const match = this.checkTrigger(trigger, context);
      if (match.matches) {
        matchScores.push(trigger.confidence);
        matchReasons.push(match.reason);
      }
    }

    if (matchScores.length === 0) {
      return null;
    }

    const avgConfidence = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;
    const adjustedConfidence = avgConfidence * pattern.successRate * pattern.confidence;

    if (adjustedConfidence < 0.3) {
      return null;
    }

    const suggestions = this.generatePatternSuggestions(pattern);

    return {
      pattern,
      matchReason: matchReasons.join('; '),
      applicabilityConfidence: adjustedConfidence,
      suggestions,
      supportingMemories: [],
    };
  }

  private checkTrigger(
    trigger: PatternTrigger,
    context: ProjectContext
  ): { matches: boolean; reason: string } {
    switch (trigger.triggerType) {
      case TriggerType.FileName:
        const matches = [...context.fileTypes].some(ft => ft.includes(trigger.value));
        return { matches, reason: `Found ${trigger.value} files` };

      case TriggerType.Dependency:
        const hasDep = context.dependencies.some(
          d => d.toLowerCase().includes(trigger.value.toLowerCase())
        );
        return { matches: hasDep, reason: `Uses ${trigger.value}` };

      case TriggerType.DirectoryStructure:
        const hasDir = context.structure.some(d => d.includes(trigger.value));
        return { matches: hasDir, reason: `Has ${trigger.value} directory` };

      default:
        return { matches: false, reason: '' };
    }
  }

  private generatePatternSuggestions(pattern: UniversalPattern): string[] {
    const suggestions: string[] = [];

    suggestions.push(
      `Consider using: ${pattern.pattern.name} - ${pattern.pattern.description}`
    );

    for (const benefit of pattern.pattern.benefits) {
      suggestions.push(`This can help with: ${benefit}`);
    }

    if (pattern.pattern.example) {
      suggestions.push(`Example: ${pattern.pattern.example}`);
    }

    return suggestions;
  }

  private updatePatternSuccessRate(patternId: string): void {
    const relevant = this.outcomes.filter(o => o.patternId === patternId);
    if (relevant.length === 0) return;

    const successCount = relevant.filter(o => o.wasSuccessful).length;
    const successRate = successCount / relevant.length;

    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.successRate = successRate;
      pattern.applicationCount = relevant.length;
    }
  }

  private extractPatternsFromCategory(
    category: PatternCategory,
    memories: MemoryForLearning[]
  ): void {
    // Group by project
    const byProject = new Map<string, MemoryForLearning[]>();
    for (const memory of memories) {
      const existing = byProject.get(memory.projectName) ?? [];
      existing.push(memory);
      byProject.set(memory.projectName, existing);
    }

    if (byProject.size < MIN_PROJECTS_FOR_UNIVERSAL) {
      return;
    }

    // Find common keywords across projects
    const keywordProjects = new Map<string, Set<string>>();

    for (const [project, projectMemories] of byProject) {
      for (const memory of projectMemories) {
        for (const word of memory.content.split(/\s+/)) {
          const clean = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          if (clean.length > 5) {
            const projects = keywordProjects.get(clean) ?? new Set();
            projects.add(project);
            keywordProjects.set(clean, projects);
          }
        }
      }
    }

    // Keywords appearing in multiple projects might indicate patterns
    for (const [keyword, projects] of keywordProjects) {
      if (projects.size >= MIN_PROJECTS_FOR_UNIVERSAL) {
        const patternId = `auto-${categoryToString(category)}-${keyword}`;

        if (!this.patterns.has(patternId)) {
          this.patterns.set(patternId, {
            id: patternId,
            pattern: {
              name: `${keyword} pattern`,
              category,
              description: `Pattern involving '${keyword}' observed in ${projects.size} projects`,
              example: null,
              triggers: [
                {
                  triggerType: TriggerType.Topic,
                  value: keyword,
                  confidence: 0.5,
                },
              ],
              benefits: [],
              considerations: [],
            },
            projectsSeenIn: Array.from(projects),
            successRate: 0.5,
            applicability: `When working with ${keyword}`,
            confidence: 0.5,
            firstSeen: new Date(),
            lastSeen: new Date(),
            applicationCount: 0,
          });
        }
      }
    }
  }
}

/** Convert category to string for ID generation */
function categoryToString(cat: PatternCategory): string {
  switch (cat) {
    case PatternCategory.ErrorHandling:
      return 'error-handling';
    case PatternCategory.AsyncConcurrency:
      return 'async';
    case PatternCategory.Testing:
      return 'testing';
    case PatternCategory.Architecture:
      return 'architecture';
    case PatternCategory.Performance:
      return 'performance';
    case PatternCategory.Security:
      return 'security';
    case PatternCategory.Debugging:
      return 'debugging';
    case PatternCategory.Refactoring:
      return 'refactoring';
    case PatternCategory.Documentation:
      return 'docs';
    case PatternCategory.Tooling:
      return 'tooling';
    case PatternCategory.Custom:
      return 'custom';
  }
}
