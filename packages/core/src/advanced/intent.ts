/**
 * Intent Detection Module
 *
 * Understand WHY the user is doing something, not just WHAT they're doing.
 * This allows Vestige to provide proactively relevant memories based on
 * the underlying goal.
 *
 * Intent Types:
 * - Debugging: Looking for the cause of a bug
 * - Refactoring: Improving code structure
 * - NewFeature: Building something new
 * - Learning: Trying to understand something
 * - Maintenance: Regular upkeep tasks
 */

import { nanoid } from 'nanoid';

/** Maximum actions to keep in history */
export const MAX_ACTION_HISTORY = 100;

/** Time window for intent detection (minutes) */
export const INTENT_WINDOW_MINUTES = 30;

/** Minimum confidence for intent detection */
export const MIN_INTENT_CONFIDENCE = 0.4;

/** Types of user actions */
export enum ActionType {
  FileOpened = 'file_opened',
  FileEdited = 'file_edited',
  FileCreated = 'file_created',
  FileDeleted = 'file_deleted',
  Search = 'search',
  CommandExecuted = 'command_executed',
  ErrorEncountered = 'error_encountered',
  DocumentationViewed = 'documentation_viewed',
  TestsRun = 'tests_run',
  DebugStarted = 'debug_started',
  GitCommit = 'git_commit',
  DiffViewed = 'diff_viewed',
}

/** Types of maintenance activities */
export enum MaintenanceType {
  DependencyUpdate = 'dependency_update',
  SecurityPatch = 'security_patch',
  Cleanup = 'cleanup',
  Configuration = 'configuration',
  Migration = 'migration',
}

/** Learning level estimation */
export enum LearningLevel {
  Beginner = 'beginner',
  Intermediate = 'intermediate',
  Advanced = 'advanced',
}

/** Depth of code review */
export enum ReviewDepth {
  Shallow = 'shallow',
  Standard = 'standard',
  Deep = 'deep',
}

/** Type of optimization */
export enum OptimizationType {
  Speed = 'speed',
  Memory = 'memory',
  Size = 'size',
  Startup = 'startup',
}

/** Detected intent from user actions */
export type DetectedIntent =
  | { type: 'debugging'; suspectedArea: string; symptoms: string[] }
  | { type: 'refactoring'; target: string; goal: string }
  | { type: 'new_feature'; featureDescription: string; relatedComponents: string[] }
  | { type: 'learning'; topic: string; level: LearningLevel }
  | { type: 'maintenance'; maintenanceType: MaintenanceType; target: string | null }
  | { type: 'code_review'; files: string[]; depth: ReviewDepth }
  | { type: 'documentation'; subject: string }
  | { type: 'optimization'; target: string; optimizationType: OptimizationType }
  | { type: 'integration'; system: string }
  | { type: 'unknown' };

/** Get a short description of the intent */
export function getIntentDescription(intent: DetectedIntent): string {
  switch (intent.type) {
    case 'debugging':
      return `Debugging issue in ${intent.suspectedArea}`;
    case 'refactoring':
      return `Refactoring ${intent.target} to ${intent.goal}`;
    case 'new_feature':
      return `Building: ${intent.featureDescription}`;
    case 'learning':
      return `Learning about ${intent.topic}`;
    case 'maintenance':
      return `${intent.maintenanceType} maintenance`;
    case 'code_review':
      return `Reviewing ${intent.files.length} files`;
    case 'documentation':
      return `Documenting ${intent.subject}`;
    case 'optimization':
      return `Optimizing ${intent.target}`;
    case 'integration':
      return `Integrating with ${intent.system}`;
    case 'unknown':
      return 'Unknown intent';
  }
}

/** Get relevant tags for memory search */
export function getIntentRelevantTags(intent: DetectedIntent): string[] {
  switch (intent.type) {
    case 'debugging':
      return ['debugging', 'error', 'troubleshooting', 'fix'];
    case 'refactoring':
      return ['refactoring', 'architecture', 'patterns', 'clean-code'];
    case 'new_feature':
      return ['feature', 'implementation', 'design'];
    case 'learning':
      return ['learning', 'tutorial', intent.topic.toLowerCase()];
    case 'maintenance':
      const tags = ['maintenance'];
      switch (intent.maintenanceType) {
        case MaintenanceType.DependencyUpdate:
          tags.push('dependencies');
          break;
        case MaintenanceType.SecurityPatch:
          tags.push('security');
          break;
        case MaintenanceType.Cleanup:
          tags.push('cleanup');
          break;
        case MaintenanceType.Configuration:
          tags.push('config');
          break;
        case MaintenanceType.Migration:
          tags.push('migration');
          break;
      }
      return tags;
    case 'code_review':
      return ['review', 'code-quality'];
    case 'documentation':
      return ['documentation', 'docs'];
    case 'optimization':
      const optTags = ['optimization', 'performance'];
      switch (intent.optimizationType) {
        case OptimizationType.Speed:
          optTags.push('speed');
          break;
        case OptimizationType.Memory:
          optTags.push('memory');
          break;
        case OptimizationType.Size:
          optTags.push('bundle-size');
          break;
        case OptimizationType.Startup:
          optTags.push('startup');
          break;
      }
      return optTags;
    case 'integration':
      return ['integration', 'api', intent.system.toLowerCase()];
    case 'unknown':
      return [];
  }
}

/** A user action that can indicate intent */
export interface UserAction {
  id: string;
  actionType: ActionType;
  file: string | null;
  content: string | null;
  timestamp: Date;
  metadata: Record<string, string>;
}

/** Create a user action */
export function createAction(
  actionType: ActionType,
  options?: {
    file?: string;
    content?: string;
    metadata?: Record<string, string>;
  }
): UserAction {
  return {
    id: nanoid(),
    actionType,
    file: options?.file ?? null,
    content: options?.content ?? null,
    timestamp: new Date(),
    metadata: options?.metadata ?? {},
  };
}

/** Create action for file opened */
export function fileOpened(path: string): UserAction {
  return createAction(ActionType.FileOpened, { file: path });
}

/** Create action for file edited */
export function fileEdited(path: string): UserAction {
  return createAction(ActionType.FileEdited, { file: path });
}

/** Create action for search query */
export function search(query: string): UserAction {
  return createAction(ActionType.Search, { content: query });
}

/** Create action for error encountered */
export function errorEncountered(message: string): UserAction {
  return createAction(ActionType.ErrorEncountered, { content: message });
}

/** Create action for command executed */
export function commandExecuted(cmd: string): UserAction {
  return createAction(ActionType.CommandExecuted, { content: cmd });
}

/** Create action for documentation viewed */
export function docsViewed(topic: string): UserAction {
  return createAction(ActionType.DocumentationViewed, { content: topic });
}

/** Result of intent detection with confidence */
export interface IntentDetectionResult {
  primaryIntent: DetectedIntent;
  confidence: number;
  alternatives: Array<{ intent: DetectedIntent; confidence: number }>;
  evidence: string[];
  detectedAt: Date;
}

/** Query parameters for finding memories relevant to an intent */
export interface IntentMemoryQuery {
  tags: string[];
  keywords: string[];
  recencyBoost: boolean;
}

/**
 * Intent Detector
 *
 * Analyzes user actions to detect underlying intent.
 */
export class IntentDetector {
  private actions: UserAction[] = [];

  /**
   * Record a user action
   */
  recordAction(action: UserAction): void {
    this.actions.push(action);

    // Trim old actions
    while (this.actions.length > MAX_ACTION_HISTORY) {
      this.actions.shift();
    }
  }

  /**
   * Get actions within the detection window
   */
  private getRecentActions(): UserAction[] {
    const cutoffMs = Date.now() - INTENT_WINDOW_MINUTES * 60 * 1000;
    return this.actions.filter(a => a.timestamp.getTime() > cutoffMs);
  }

  /**
   * Detect intent from recorded actions
   */
  detectIntent(): IntentDetectionResult {
    const actions = this.getRecentActions();

    if (actions.length === 0) {
      return {
        primaryIntent: { type: 'unknown' },
        confidence: 0,
        alternatives: [],
        evidence: [],
        detectedAt: new Date(),
      };
    }

    // Score each pattern
    const scores: Array<{ intent: DetectedIntent; score: number; pattern: string }> = [];

    // Debugging pattern
    const debugScore = this.scoreDebugging(actions);
    if (debugScore.score >= MIN_INTENT_CONFIDENCE) {
      scores.push(debugScore);
    }

    // Refactoring pattern
    const refactorScore = this.scoreRefactoring(actions);
    if (refactorScore.score >= MIN_INTENT_CONFIDENCE) {
      scores.push(refactorScore);
    }

    // Learning pattern
    const learnScore = this.scoreLearning(actions);
    if (learnScore.score >= MIN_INTENT_CONFIDENCE) {
      scores.push(learnScore);
    }

    // New feature pattern
    const featureScore = this.scoreNewFeature(actions);
    if (featureScore.score >= MIN_INTENT_CONFIDENCE) {
      scores.push(featureScore);
    }

    // Maintenance pattern
    const maintScore = this.scoreMaintenance(actions);
    if (maintScore.score >= MIN_INTENT_CONFIDENCE) {
      scores.push(maintScore);
    }

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return {
        primaryIntent: { type: 'unknown' },
        confidence: 0,
        alternatives: [],
        evidence: this.collectEvidence(actions),
        detectedAt: new Date(),
      };
    }

    const primary = scores.shift()!;
    const alternatives = scores.slice(0, 3).map(s => ({
      intent: s.intent,
      confidence: s.score,
    }));

    return {
      primaryIntent: primary.intent,
      confidence: primary.score,
      alternatives,
      evidence: this.collectEvidence(actions),
      detectedAt: new Date(),
    };
  }

  /**
   * Get memories relevant to detected intent
   */
  memoriesForIntent(intent: DetectedIntent): IntentMemoryQuery {
    const tags = getIntentRelevantTags(intent);
    const keywords = this.extractIntentKeywords(intent);

    return {
      tags,
      keywords,
      recencyBoost: intent.type === 'debugging',
    };
  }

  /**
   * Clear action history
   */
  clearActions(): void {
    this.actions = [];
  }

  /**
   * Get action count
   */
  actionCount(): number {
    return this.actions.length;
  }

  // Pattern scoring methods

  private scoreDebugging(actions: UserAction[]): { intent: DetectedIntent; score: number; pattern: string } {
    let score = 0;
    const symptoms: string[] = [];
    let suspectedArea = '';

    for (const action of actions) {
      switch (action.actionType) {
        case ActionType.ErrorEncountered:
          score += 0.3;
          if (action.content) symptoms.push(action.content);
          break;
        case ActionType.DebugStarted:
          score += 0.4;
          break;
        case ActionType.Search:
          if (action.content) {
            const lower = action.content.toLowerCase();
            if (lower.includes('error') || lower.includes('bug') || lower.includes('fix')) {
              score += 0.2;
            }
          }
          break;
        case ActionType.FileOpened:
        case ActionType.FileEdited:
          if (action.file) {
            const parts = action.file.split('/');
            suspectedArea = parts[parts.length - 1] ?? '';
          }
          break;
      }
    }

    return {
      intent: {
        type: 'debugging',
        suspectedArea: suspectedArea || 'unknown',
        symptoms,
      },
      score: Math.min(1, score),
      pattern: 'Debugging',
    };
  }

  private scoreRefactoring(actions: UserAction[]): { intent: DetectedIntent; score: number; pattern: string } {
    let score = 0;
    let target = '';

    const editCount = actions.filter(a => a.actionType === ActionType.FileEdited).length;
    if (editCount >= 3) {
      score += 0.3;
    }

    for (const action of actions) {
      if (action.actionType === ActionType.Search && action.content) {
        const lower = action.content.toLowerCase();
        if (lower.includes('refactor') || lower.includes('rename') || lower.includes('extract')) {
          score += 0.3;
        }
      }
      if (action.actionType === ActionType.FileEdited && action.file) {
        target = action.file;
      }
    }

    return {
      intent: {
        type: 'refactoring',
        target: target || 'code',
        goal: 'improve structure',
      },
      score: Math.min(1, score),
      pattern: 'Refactoring',
    };
  }

  private scoreLearning(actions: UserAction[]): { intent: DetectedIntent; score: number; pattern: string } {
    let score = 0;
    let topic = '';

    for (const action of actions) {
      switch (action.actionType) {
        case ActionType.DocumentationViewed:
          score += 0.3;
          if (action.content) topic = action.content;
          break;
        case ActionType.Search:
          if (action.content) {
            const lower = action.content.toLowerCase();
            if (
              lower.includes('how to') ||
              lower.includes('what is') ||
              lower.includes('tutorial') ||
              lower.includes('guide') ||
              lower.includes('example')
            ) {
              score += 0.25;
              topic = action.content;
            }
          }
          break;
      }
    }

    return {
      intent: {
        type: 'learning',
        topic: topic || 'unknown',
        level: LearningLevel.Intermediate,
      },
      score: Math.min(1, score),
      pattern: 'Learning',
    };
  }

  private scoreNewFeature(actions: UserAction[]): { intent: DetectedIntent; score: number; pattern: string } {
    let score = 0;
    let description = '';
    const components: string[] = [];

    const createdCount = actions.filter(a => a.actionType === ActionType.FileCreated).length;
    if (createdCount >= 1) {
      score += 0.4;
    }

    for (const action of actions) {
      switch (action.actionType) {
        case ActionType.FileCreated:
          if (action.file) {
            const parts = action.file.split('/');
            description = parts[parts.length - 1] ?? '';
          }
          break;
        case ActionType.FileOpened:
        case ActionType.FileEdited:
          if (action.file) components.push(action.file);
          break;
      }
    }

    return {
      intent: {
        type: 'new_feature',
        featureDescription: description || 'new feature',
        relatedComponents: components,
      },
      score: Math.min(1, score),
      pattern: 'NewFeature',
    };
  }

  private scoreMaintenance(actions: UserAction[]): { intent: DetectedIntent; score: number; pattern: string } {
    let score = 0;
    let maintType = MaintenanceType.Cleanup;
    let target: string | null = null;

    for (const action of actions) {
      switch (action.actionType) {
        case ActionType.CommandExecuted:
          if (action.content) {
            const lower = action.content.toLowerCase();
            if (
              lower.includes('upgrade') ||
              lower.includes('update') ||
              lower.includes('npm') ||
              lower.includes('cargo update')
            ) {
              score += 0.4;
              maintType = MaintenanceType.DependencyUpdate;
            }
          }
          break;
        case ActionType.FileEdited:
          if (action.file) {
            const lower = action.file.toLowerCase();
            const fileName = action.file.split('/').pop()?.toLowerCase() ?? '';
            if (
              lower.includes('config') ||
              fileName === 'cargo.toml' ||
              fileName === 'package.json'
            ) {
              score += 0.2;
              maintType = MaintenanceType.Configuration;
              target = fileName;
            }
          }
          break;
      }
    }

    return {
      intent: {
        type: 'maintenance',
        maintenanceType: maintType,
        target,
      },
      score: Math.min(1, score),
      pattern: 'Maintenance',
    };
  }

  private collectEvidence(actions: UserAction[]): string[] {
    return actions.slice(0, 5).map(a => {
      switch (a.actionType) {
        case ActionType.FileOpened:
        case ActionType.FileEdited:
          return `${a.actionType}: ${a.file ?? ''}`;
        case ActionType.Search:
          return `Searched: ${a.content ?? ''}`;
        case ActionType.ErrorEncountered:
          return `Error: ${a.content ?? ''}`;
        default:
          return a.actionType;
      }
    });
  }

  private extractIntentKeywords(intent: DetectedIntent): string[] {
    switch (intent.type) {
      case 'debugging':
        return [intent.suspectedArea, ...intent.symptoms.slice(0, 3)];
      case 'refactoring':
        return [intent.target, intent.goal];
      case 'new_feature':
        return [intent.featureDescription, ...intent.relatedComponents.slice(0, 3)];
      case 'learning':
        return [intent.topic];
      case 'integration':
        return [intent.system];
      default:
        return [];
    }
  }
}
