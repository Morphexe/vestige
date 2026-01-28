/**
 * File Watcher Module
 *
 * Watches file system for changes and tracks:
 * - File modifications for pattern detection
 * - Co-edit patterns (files edited together)
 * - Session-based file grouping
 *
 * Integrates with:
 * - RelationshipTracker for co-edit relationship tracking
 * - PatternDetector for detecting patterns in modified files
 */

import { EventEmitter } from 'events';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Type of file event
 */
export type FileEventKind = 'created' | 'modified' | 'deleted' | 'renamed';

/**
 * A file system event
 */
export interface FileEvent {
  /** Type of event */
  kind: FileEventKind;
  /** Affected file path(s) */
  paths: string[];
  /** When the event occurred */
  timestamp: Date;
}

/**
 * Configuration for the file watcher
 */
export interface WatcherConfig {
  /** Debounce interval in milliseconds */
  debounceInterval: number;
  /** Glob patterns to ignore */
  ignorePatterns: string[];
  /** File extensions to watch (if empty, watch all) */
  watchExtensions?: string[];
  /** Maximum directory depth */
  maxDepth?: number;
  /** Enable pattern detection on file changes */
  detectPatterns: boolean;
  /** Enable relationship tracking */
  trackRelationships: boolean;
  /** Session timeout in milliseconds */
  sessionTimeoutMs: number;
}

/**
 * Default watcher configuration
 */
export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  debounceInterval: 500,
  ignorePatterns: [
    '**/node_modules/**',
    '**/target/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/__pycache__/**',
    '**/*.pyc',
    '**/coverage/**',
    '**/.turbo/**',
    '**/bun.lockb',
  ],
  watchExtensions: [
    'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'rb', 'php',
    'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala', 'vue', 'svelte',
    'md', 'json', 'yaml', 'yml', 'toml'
  ],
  maxDepth: 10,
  detectPatterns: true,
  trackRelationships: true,
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
};

/**
 * An edit session tracking files modified together
 */
export interface EditSession {
  /** Files modified in this session */
  files: Set<string>;
  /** When the session started */
  startedAt: Date;
  /** When the session was last updated */
  lastEditAt: Date;
}

/**
 * Language detection result
 */
export interface LanguageInfo {
  /** Detected language */
  language: string;
  /** File extension */
  extension: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Extension to language mapping */
export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  'ts': 'typescript',
  'tsx': 'typescript',
  'js': 'javascript',
  'jsx': 'javascript',
  'mjs': 'javascript',
  'cjs': 'javascript',
  // Python
  'py': 'python',
  'pyi': 'python',
  'pyw': 'python',
  // Rust
  'rs': 'rust',
  // Go
  'go': 'go',
  // Java
  'java': 'java',
  // Ruby
  'rb': 'ruby',
  'erb': 'ruby',
  // PHP
  'php': 'php',
  // C/C++
  'c': 'c',
  'h': 'c',
  'cpp': 'cpp',
  'hpp': 'cpp',
  'cc': 'cpp',
  'cxx': 'cpp',
  // C#
  'cs': 'csharp',
  // Swift
  'swift': 'swift',
  // Kotlin
  'kt': 'kotlin',
  'kts': 'kotlin',
  // Scala
  'scala': 'scala',
  // Vue/Svelte
  'vue': 'vue',
  'svelte': 'svelte',
  // Config/Data
  'json': 'json',
  'yaml': 'yaml',
  'yml': 'yaml',
  'toml': 'toml',
  'xml': 'xml',
  // Shell
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  // Documentation
  'md': 'markdown',
  'mdx': 'markdown',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

/**
 * Check if a path should be ignored based on patterns
 */
export function shouldIgnore(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    // Simple glob matching
    if (pattern.includes('**')) {
      // Match any path containing the pattern
      const regex = new RegExp(
        pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.'),
        'i'
      );
      if (regex.test(normalizedPath)) {
        return true;
      }
    } else if (pattern.includes('*')) {
      // Simple wildcard
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
        'i'
      );
      if (regex.test(path.basename(normalizedPath))) {
        return true;
      }
    } else {
      // Exact match
      if (normalizedPath.includes(pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if file has a watched extension
 */
export function hasWatchedExtension(filePath: string, extensions?: string[]): boolean {
  if (!extensions || extensions.length === 0) {
    return true; // Watch all if no extensions specified
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  return extensions.includes(ext);
}

// ============================================================================
// FILE WATCHER
// ============================================================================

/**
 * File Watcher
 *
 * Watches directories for file changes and tracks edit sessions.
 * Uses chokidar for cross-platform file watching (when available).
 */
export class FileWatcher extends EventEmitter {
  private config: WatcherConfig;
  private watchedDirectories: Set<string> = new Set();
  private currentSession: EditSession | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private chokidar: typeof import('chokidar') | null = null;
  private watchers: Map<string, import('chokidar').FSWatcher> = new Map();
  private enabled: boolean = true;
  private stats = {
    eventsReceived: 0,
    filesModified: 0,
    sessionsCompleted: 0,
  };

  /** Callback for when patterns should be detected */
  public onPatternDetection?: (filePath: string, content: string, language: string) => void;

  /** Callback for when co-edits should be recorded */
  public onCoEdit?: (files: string[]) => void;

  constructor(config?: Partial<WatcherConfig>) {
    super();
    this.config = { ...DEFAULT_WATCHER_CONFIG, ...config };
  }

  /**
   * Initialize chokidar (lazy loading)
   */
  private async initChokidar(): Promise<typeof import('chokidar') | null> {
    if (this.chokidar) return this.chokidar;

    try {
      // Dynamic import to avoid issues when chokidar isn't installed
      this.chokidar = await import('chokidar');
      return this.chokidar;
    } catch {
      console.warn('chokidar not available - file watching disabled');
      return null;
    }
  }

  /**
   * Start watching a directory
   */
  async watch(directory: string): Promise<boolean> {
    if (!this.enabled) return false;
    if (this.watchedDirectories.has(directory)) return true;

    const chokidar = await this.initChokidar();
    if (!chokidar) return false;

    try {
      const watcher = chokidar.watch(directory, {
        ignored: this.config.ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        depth: this.config.maxDepth,
        awaitWriteFinish: {
          stabilityThreshold: this.config.debounceInterval,
          pollInterval: 100,
        },
      });

      watcher.on('add', (filePath) => this.handleEvent('created', filePath));
      watcher.on('change', (filePath) => this.handleEvent('modified', filePath));
      watcher.on('unlink', (filePath) => this.handleEvent('deleted', filePath));
      watcher.on('error', (error) => this.emit('error', error));

      this.watchers.set(directory, watcher);
      this.watchedDirectories.add(directory);
      this.emit('watch', directory);

      return true;
    } catch (error) {
      console.error(`Failed to watch directory ${directory}:`, error);
      return false;
    }
  }

  /**
   * Stop watching a directory
   */
  async unwatch(directory: string): Promise<boolean> {
    const watcher = this.watchers.get(directory);
    if (!watcher) return false;

    await watcher.close();
    this.watchers.delete(directory);
    this.watchedDirectories.delete(directory);
    this.emit('unwatch', directory);

    return true;
  }

  /**
   * Stop all watchers
   */
  async stop(): Promise<void> {
    // Finalize current session
    this.finalizeSession();

    // Clear timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }

    // Close all watchers
    const closePromises = Array.from(this.watchers.values()).map(w => w.close());
    await Promise.all(closePromises);

    this.watchers.clear();
    this.watchedDirectories.clear();
    this.emit('stop');
  }

  /**
   * Handle a file event
   */
  private handleEvent(kind: FileEventKind, filePath: string): void {
    // Check if we should process this file
    if (!this.shouldProcess(filePath)) {
      return;
    }

    this.stats.eventsReceived++;

    // Debounce rapid events on same file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.processEvent(kind, filePath);
      this.debounceTimers.delete(filePath);
    }, this.config.debounceInterval);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Process a file event after debouncing
   */
  private processEvent(kind: FileEventKind, filePath: string): void {
    const event: FileEvent = {
      kind,
      paths: [filePath],
      timestamp: new Date(),
    };

    this.emit('event', event);

    if (kind === 'modified') {
      this.stats.filesModified++;
      this.onFileModified(filePath);
    } else if (kind === 'created') {
      this.onFileCreated(filePath);
    } else if (kind === 'deleted') {
      this.onFileDeleted(filePath);
    }
  }

  /**
   * Check if a file should be processed
   */
  shouldProcess(filePath: string): boolean {
    if (shouldIgnore(filePath, this.config.ignorePatterns)) {
      return false;
    }

    if (!hasWatchedExtension(filePath, this.config.watchExtensions)) {
      return false;
    }

    return true;
  }

  /**
   * Handle file modification
   */
  private onFileModified(filePath: string): void {
    // Update session
    this.updateSession(filePath);

    // Detect patterns if enabled
    if (this.config.detectPatterns && this.onPatternDetection) {
      const language = detectLanguage(filePath);
      if (language) {
        // Read file content asynchronously
        import('fs').then(fs => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            this.onPatternDetection?.(filePath, content, language);
          } catch {
            // File might have been deleted or moved
          }
        });
      }
    }

    this.emit('modified', filePath);
  }

  /**
   * Handle file creation
   */
  private onFileCreated(filePath: string): void {
    this.updateSession(filePath);
    this.emit('created', filePath);
  }

  /**
   * Handle file deletion
   */
  private onFileDeleted(filePath: string): void {
    // Remove from current session if present
    if (this.currentSession) {
      this.currentSession.files.delete(filePath);
    }
    this.emit('deleted', filePath);
  }

  /**
   * Update the current edit session
   */
  private updateSession(filePath: string): void {
    const now = new Date();

    if (this.currentSession) {
      // Check if session has expired
      const elapsed = now.getTime() - this.currentSession.lastEditAt.getTime();
      if (elapsed > this.config.sessionTimeoutMs) {
        // Finalize old session and start new one
        this.finalizeSession();
        this.startNewSession(filePath);
      } else {
        // Add to current session
        this.currentSession.files.add(filePath);
        this.currentSession.lastEditAt = now;
      }
    } else {
      // Start new session
      this.startNewSession(filePath);
    }

    // Reset session timeout timer
    this.resetSessionTimer();
  }

  /**
   * Start a new edit session
   */
  private startNewSession(initialFile: string): void {
    this.currentSession = {
      files: new Set([initialFile]),
      startedAt: new Date(),
      lastEditAt: new Date(),
    };
  }

  /**
   * Reset the session timeout timer
   */
  private resetSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }

    this.sessionTimer = setTimeout(() => {
      this.finalizeSession();
    }, this.config.sessionTimeoutMs);
  }

  /**
   * Finalize the current session and record co-edits
   */
  finalizeSession(): void {
    if (!this.currentSession) return;

    const files = Array.from(this.currentSession.files);

    // Record co-edits if we have multiple files and tracking is enabled
    if (files.length >= 2 && this.config.trackRelationships && this.onCoEdit) {
      this.onCoEdit(files);
    }

    this.stats.sessionsCompleted++;
    this.currentSession = null;
    this.emit('session-end', files);
  }

  /**
   * Get current session info
   */
  getCurrentSession(): EditSession | null {
    return this.currentSession ? {
      files: new Set(this.currentSession.files),
      startedAt: this.currentSession.startedAt,
      lastEditAt: this.currentSession.lastEditAt,
    } : null;
  }

  /**
   * Get watched directories
   */
  getWatchedDirectories(): string[] {
    return Array.from(this.watchedDirectories);
  }

  /**
   * Check if a directory is being watched
   */
  isWatching(directory: string): boolean {
    return this.watchedDirectories.has(directory);
  }

  /**
   * Enable or disable the watcher
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  /**
   * Check if watcher is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get statistics
   */
  getStats(): {
    eventsReceived: number;
    filesModified: number;
    sessionsCompleted: number;
    watchedDirectories: number;
    currentSessionFiles: number;
  } {
    return {
      ...this.stats,
      watchedDirectories: this.watchedDirectories.size,
      currentSessionFiles: this.currentSession?.files.size ?? 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WatcherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): WatcherConfig {
    return { ...this.config };
  }
}

/**
 * Create a file watcher with default configuration
 */
export function createFileWatcher(config?: Partial<WatcherConfig>): FileWatcher {
  return new FileWatcher(config);
}
