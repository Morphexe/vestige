/**
 * Tests for File Watcher
 *
 * Tests cover:
 * - File filtering
 * - Language detection
 * - Configuration
 * - Session management
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  FileWatcher,
  detectLanguage,
  shouldIgnore,
  hasWatchedExtension,
  DEFAULT_WATCHER_CONFIG,
  EXTENSION_LANGUAGE_MAP,
  type WatcherConfig,
  type FileEvent,
} from '../../codebase/watcher.js';

describe('File Watcher', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher({
      debounceInterval: 100,
      ignorePatterns: ['**/node_modules/**', '**/.git/**'],
      watchExtensions: ['ts', 'js', 'py'],
      detectPatterns: false,
      trackRelationships: false,
      sessionTimeoutMs: 30000,
    });
  });

  afterEach(async () => {
    await watcher.stop();
  });

  // ==========================================================================
  // 1. LANGUAGE DETECTION TESTS
  // ==========================================================================

  describe('detectLanguage', () => {
    it('should detect TypeScript', () => {
      expect(detectLanguage('/path/file.ts')).toBe('typescript');
      expect(detectLanguage('/path/file.tsx')).toBe('typescript');
    });

    it('should detect JavaScript', () => {
      expect(detectLanguage('/path/file.js')).toBe('javascript');
      expect(detectLanguage('/path/file.jsx')).toBe('javascript');
      expect(detectLanguage('/path/file.mjs')).toBe('javascript');
    });

    it('should detect Python', () => {
      expect(detectLanguage('/path/file.py')).toBe('python');
    });

    it('should detect Rust', () => {
      expect(detectLanguage('/path/file.rs')).toBe('rust');
    });

    it('should detect Go', () => {
      expect(detectLanguage('/path/file.go')).toBe('go');
    });

    it('should detect Java', () => {
      expect(detectLanguage('/path/file.java')).toBe('java');
    });

    it('should detect C/C++', () => {
      expect(detectLanguage('/path/file.c')).toBe('c');
      expect(detectLanguage('/path/file.cpp')).toBe('cpp');
      expect(detectLanguage('/path/file.h')).toBe('c');
    });

    it('should return null for unknown extension', () => {
      expect(detectLanguage('/path/file.xyz')).toBeNull();
    });

    it('should handle case insensitively', () => {
      expect(detectLanguage('/path/file.TS')).toBe('typescript');
      expect(detectLanguage('/path/file.PY')).toBe('python');
    });
  });

  // ==========================================================================
  // 2. FILE FILTERING TESTS (shouldIgnore)
  // ==========================================================================

  describe('shouldIgnore', () => {
    it('should ignore node_modules paths', () => {
      const patterns = ['**/node_modules/**'];
      expect(shouldIgnore('/project/node_modules/lib/index.js', patterns)).toBe(true);
    });

    it('should ignore .git paths', () => {
      const patterns = ['**/.git/**'];
      expect(shouldIgnore('/project/.git/config', patterns)).toBe(true);
    });

    it('should not ignore normal paths', () => {
      const patterns = ['**/node_modules/**', '**/.git/**'];
      expect(shouldIgnore('/project/src/index.ts', patterns)).toBe(false);
    });

    it('should handle exact pattern matches', () => {
      const patterns = ['package-lock.json'];
      expect(shouldIgnore('/project/package-lock.json', patterns)).toBe(true);
    });

    it('should handle wildcard patterns', () => {
      const patterns = ['*.pyc'];
      expect(shouldIgnore('/project/__pycache__/module.pyc', patterns)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. EXTENSION FILTERING TESTS
  // ==========================================================================

  describe('hasWatchedExtension', () => {
    it('should return true for watched extensions', () => {
      const extensions = ['ts', 'js', 'py'];
      expect(hasWatchedExtension('/path/file.ts', extensions)).toBe(true);
      expect(hasWatchedExtension('/path/file.js', extensions)).toBe(true);
      expect(hasWatchedExtension('/path/file.py', extensions)).toBe(true);
    });

    it('should return false for unwatched extensions', () => {
      const extensions = ['ts', 'js'];
      expect(hasWatchedExtension('/path/file.py', extensions)).toBe(false);
      expect(hasWatchedExtension('/path/file.exe', extensions)).toBe(false);
    });

    it('should return true for any extension when no filter', () => {
      expect(hasWatchedExtension('/path/file.xyz', [])).toBe(true);
      expect(hasWatchedExtension('/path/file.anything', undefined)).toBe(true);
    });

    it('should handle files without extension', () => {
      const extensions = ['ts', 'js'];
      expect(hasWatchedExtension('/path/Makefile', extensions)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. DEFAULT CONFIG TESTS
  // ==========================================================================

  describe('DEFAULT_WATCHER_CONFIG', () => {
    it('should have reasonable debounce interval', () => {
      expect(DEFAULT_WATCHER_CONFIG.debounceInterval).toBeGreaterThan(0);
      expect(DEFAULT_WATCHER_CONFIG.debounceInterval).toBeLessThanOrEqual(1000);
    });

    it('should ignore common generated directories', () => {
      expect(DEFAULT_WATCHER_CONFIG.ignorePatterns).toContain('**/node_modules/**');
      expect(DEFAULT_WATCHER_CONFIG.ignorePatterns).toContain('**/.git/**');
      expect(DEFAULT_WATCHER_CONFIG.ignorePatterns).toContain('**/dist/**');
    });

    it('should watch common source extensions', () => {
      expect(DEFAULT_WATCHER_CONFIG.watchExtensions).toContain('ts');
      expect(DEFAULT_WATCHER_CONFIG.watchExtensions).toContain('js');
      expect(DEFAULT_WATCHER_CONFIG.watchExtensions).toContain('py');
      expect(DEFAULT_WATCHER_CONFIG.watchExtensions).toContain('rs');
    });

    it('should have session timeout', () => {
      expect(DEFAULT_WATCHER_CONFIG.sessionTimeoutMs).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. EXTENSION LANGUAGE MAP TESTS
  // ==========================================================================

  describe('EXTENSION_LANGUAGE_MAP', () => {
    it('should have mappings for common languages', () => {
      expect(EXTENSION_LANGUAGE_MAP['ts']).toBe('typescript');
      expect(EXTENSION_LANGUAGE_MAP['js']).toBe('javascript');
      expect(EXTENSION_LANGUAGE_MAP['py']).toBe('python');
      expect(EXTENSION_LANGUAGE_MAP['rs']).toBe('rust');
      expect(EXTENSION_LANGUAGE_MAP['go']).toBe('go');
    });

    it('should have mappings for config files', () => {
      expect(EXTENSION_LANGUAGE_MAP['json']).toBe('json');
      expect(EXTENSION_LANGUAGE_MAP['yaml']).toBe('yaml');
      expect(EXTENSION_LANGUAGE_MAP['yml']).toBe('yaml');
      expect(EXTENSION_LANGUAGE_MAP['toml']).toBe('toml');
    });
  });

  // ==========================================================================
  // 6. WATCHER INSTANCE TESTS
  // ==========================================================================

  describe('FileWatcher instance', () => {
    it('should create watcher with default config', () => {
      const w = new FileWatcher();
      expect(w).toBeDefined();
      w.stop();
    });

    it('should create watcher with custom config', () => {
      const config: Partial<WatcherConfig> = {
        debounceInterval: 200,
        ignorePatterns: ['**/dist/**'],
        detectPatterns: true,
        trackRelationships: true,
      };

      const w = new FileWatcher(config);
      const retrieved = w.getConfig();
      expect(retrieved.debounceInterval).toBe(200);
      expect(retrieved.detectPatterns).toBe(true);
      w.stop();
    });

    it('should be enabled by default', () => {
      expect(watcher.isEnabled()).toBe(true);
    });

    it('should be able to disable', () => {
      watcher.setEnabled(false);
      expect(watcher.isEnabled()).toBe(false);
    });

    it('should track watched directories', () => {
      // Initially no directories watched
      expect(watcher.getWatchedDirectories().length).toBe(0);
    });

    it('should check if directory is watched', () => {
      expect(watcher.isWatching('/some/path')).toBe(false);
    });

    it('should shouldProcess based on config', () => {
      expect(watcher.shouldProcess('/path/file.ts')).toBe(true);
      expect(watcher.shouldProcess('/path/file.exe')).toBe(false);
      expect(watcher.shouldProcess('/project/node_modules/lib/file.ts')).toBe(false);
    });

    it('should provide statistics', () => {
      const stats = watcher.getStats();
      expect(stats.eventsReceived).toBeDefined();
      expect(stats.filesModified).toBeDefined();
      expect(stats.sessionsCompleted).toBeDefined();
      expect(stats.watchedDirectories).toBeDefined();
      expect(stats.currentSessionFiles).toBeDefined();
    });

    it('should update configuration', () => {
      watcher.updateConfig({ debounceInterval: 500 });
      const config = watcher.getConfig();
      expect(config.debounceInterval).toBe(500);
    });
  });

  // ==========================================================================
  // 7. SESSION TESTS
  // ==========================================================================

  describe('session management', () => {
    it('should start with no current session', () => {
      const session = watcher.getCurrentSession();
      expect(session).toBeNull();
    });

    it('should finalize session', () => {
      // Finalizing empty session should not throw
      expect(() => watcher.finalizeSession()).not.toThrow();
    });
  });

  // ==========================================================================
  // 8. EVENT EMITTER TESTS
  // ==========================================================================

  describe('event emitter', () => {
    it('should extend EventEmitter', () => {
      expect(typeof watcher.on).toBe('function');
      expect(typeof watcher.emit).toBe('function');
      expect(typeof watcher.removeListener).toBe('function');
    });

    it('should accept event listeners', () => {
      let called = false;
      watcher.on('stop', () => {
        called = true;
      });

      watcher.emit('stop');
      expect(called).toBe(true);
    });
  });

  // ==========================================================================
  // 9. CALLBACK TESTS
  // ==========================================================================

  describe('callbacks', () => {
    it('should allow setting pattern detection callback', () => {
      let callbackSet = false;
      watcher.onPatternDetection = (path, content, language) => {
        callbackSet = true;
      };

      expect(watcher.onPatternDetection).toBeDefined();
    });

    it('should allow setting co-edit callback', () => {
      let callbackSet = false;
      watcher.onCoEdit = (files) => {
        callbackSet = true;
      };

      expect(watcher.onCoEdit).toBeDefined();
    });
  });
});
