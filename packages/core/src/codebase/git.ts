/**
 * Git Analysis Module
 *
 * This module analyzes git history to automatically extract:
 * - File co-change patterns (files that frequently change together)
 * - Bug fix patterns (from commit messages matching conventional formats)
 * - Current git context (branch, uncommitted changes, recent history)
 *
 * This is a key differentiator for Vestige - learning from the codebase's history
 * without requiring explicit user input.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

import {
  type BugFix,
  type FileRelationship,
  BugSeverity,
  RelationType,
  RelationshipSource,
  createBugFix,
  createGitCochangeRelationship,
} from './types.js';

const execAsync = promisify(exec);

// ============================================================================
// GIT CONTEXT
// ============================================================================

/** Information about a git commit */
export interface CommitInfo {
  /** Commit SHA (short) */
  sha: string;
  /** Full commit SHA */
  fullSha: string;
  /** Commit message (first line) */
  message: string;
  /** Full commit message */
  fullMessage: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string;
  /** Commit timestamp */
  timestamp: Date;
  /** Files changed in this commit */
  filesChanged: string[];
  /** Is this a merge commit? */
  isMerge: boolean;
}

/** Current git context for a repository */
export interface GitContext {
  /** Root path of the repository */
  repoRoot: string;
  /** Current branch name */
  currentBranch: string;
  /** HEAD commit SHA */
  headCommit: string;
  /** Files with uncommitted changes (unstaged) */
  uncommittedChanges: string[];
  /** Files staged for commit */
  stagedChanges: string[];
  /** Recent commits */
  recentCommits: CommitInfo[];
  /** Whether the repository has any commits */
  hasCommits: boolean;
  /** Whether there are untracked files */
  hasUntracked: boolean;
}

// ============================================================================
// HISTORY ANALYSIS RESULT
// ============================================================================

/** Result of analyzing git history */
export interface HistoryAnalysis {
  /** Bug fixes extracted from commits */
  bugFixes: BugFix[];
  /** File relationships discovered from co-change patterns */
  fileRelationships: FileRelationship[];
  /** Total commits analyzed */
  commitCount: number;
  /** Top contributors (author, commit count) */
  topContributors: Array<{ author: string; count: number }>;
  /** Most frequently changed files (path, change count) */
  hotFiles: Array<{ path: string; count: number }>;
  /** Time period analyzed from */
  analyzedSince: Date | null;
}

// ============================================================================
// GIT ANALYZER
// ============================================================================

/**
 * Git Analyzer
 *
 * Analyzes git history to extract knowledge.
 */
export class GitAnalyzer {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /** Execute a git command in the repository */
  private async gitExec(args: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${args}`, {
        cwd: this.repoPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: git ${args}`);
    }
  }

  /** Check if the repository is valid */
  async isValidRepo(): Promise<boolean> {
    try {
      await this.gitExec('rev-parse --is-inside-work-tree');
      return true;
    } catch {
      return false;
    }
  }

  /** Get the current git context */
  async getCurrentContext(): Promise<GitContext> {
    // Get repository root
    const repoRoot = await this.gitExec('rev-parse --show-toplevel');

    // Get current branch
    let currentBranch = 'main';
    try {
      currentBranch = await this.gitExec('branch --show-current');
      if (!currentBranch) {
        // Detached HEAD
        currentBranch = await this.gitExec('rev-parse --short HEAD');
      }
    } catch {
      // New repo with no commits
    }

    // Get HEAD commit
    let headCommit = '';
    let hasCommits = false;
    try {
      headCommit = await this.gitExec('rev-parse --short HEAD');
      hasCommits = true;
    } catch {
      // No commits yet
    }

    // Get status
    const uncommittedChanges: string[] = [];
    const stagedChanges: string[] = [];
    let hasUntracked = false;

    try {
      const status = await this.gitExec('status --porcelain');
      for (const line of status.split('\n')) {
        if (!line) continue;
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        if (statusCode.startsWith('?')) {
          hasUntracked = true;
        }
        if (statusCode[1] !== ' ' && statusCode[1] !== '?') {
          uncommittedChanges.push(filePath);
        }
        if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
          stagedChanges.push(filePath);
        }
      }
    } catch {
      // Ignore status errors
    }

    // Get recent commits
    const recentCommits = hasCommits ? await this.getRecentCommits(10) : [];

    return {
      repoRoot,
      currentBranch,
      headCommit,
      uncommittedChanges,
      stagedChanges,
      recentCommits,
      hasCommits,
      hasUntracked,
    };
  }

  /** Get recent commits */
  async getRecentCommits(limit: number): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    try {
      // Format: hash|shortHash|author|email|timestamp|subject
      const format = '%H|%h|%an|%ae|%at|%s';
      const log = await this.gitExec(`log --format="${format}" -${limit}`);

      for (const line of log.split('\n')) {
        if (!line) continue;
        const parts = line.split('|');
        if (parts.length < 6) continue;

        const [fullSha, sha, author, authorEmail, timestampStr, ...messageParts] = parts;
        const message = messageParts.join('|');
        const timestamp = new Date(parseInt(timestampStr!, 10) * 1000);

        // Get files changed
        const filesOutput = await this.gitExec(`diff-tree --no-commit-id --name-only -r ${sha}`);
        const filesChanged = filesOutput.split('\n').filter(f => f);

        // Check if merge commit
        const parentCount = await this.gitExec(`rev-list --parents -n 1 ${sha}`);
        const isMerge = parentCount.split(' ').length > 2;

        commits.push({
          sha: sha!,
          fullSha: fullSha!,
          message,
          fullMessage: message, // Would need another call for full message
          author: author!,
          authorEmail: authorEmail!,
          timestamp,
          filesChanged,
          isMerge,
        });
      }
    } catch {
      // Return empty array on error
    }

    return commits;
  }

  /** Check if a file is relevant for analysis */
  private isRelevantFile(filePath: string): boolean {
    const pathStr = filePath.toLowerCase();

    // Skip lock files, generated files, etc.
    if (
      pathStr.includes('cargo.lock') ||
      pathStr.includes('package-lock.json') ||
      pathStr.includes('yarn.lock') ||
      pathStr.includes('pnpm-lock.yaml') ||
      pathStr.includes('.min.') ||
      pathStr.includes('.map') ||
      pathStr.includes('node_modules') ||
      pathStr.includes('target/') ||
      pathStr.includes('dist/') ||
      pathStr.includes('build/') ||
      pathStr.includes('.git/')
    ) {
      return false;
    }

    // Include source files
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const relevantExts = [
      'rs',
      'ts',
      'tsx',
      'js',
      'jsx',
      'py',
      'go',
      'java',
      'kt',
      'swift',
      'c',
      'cpp',
      'h',
      'hpp',
      'toml',
      'yaml',
      'yml',
      'json',
      'md',
      'sql',
    ];

    return relevantExts.includes(ext);
  }

  /** Find files that frequently change together */
  async findCochangePatterns(
    since: Date | null,
    minCooccurrence: number
  ): Promise<FileRelationship[]> {
    // Track how often each pair of files changes together
    const cochangeCounts = new Map<string, number>();
    const fileChangeCounts = new Map<string, number>();
    let totalCommits = 0;

    try {
      // Get commits
      const sinceArg = since ? `--since="${since.toISOString()}"` : '';
      const format = '%H';
      const log = await this.gitExec(`log --format="${format}" ${sinceArg} --no-merges`);
      const commits = log.split('\n').filter(c => c);

      for (const commitSha of commits) {
        // Get files changed in this commit
        const filesOutput = await this.gitExec(`diff-tree --no-commit-id --name-only -r ${commitSha}`);
        const files = filesOutput
          .split('\n')
          .filter(f => f && this.isRelevantFile(f));

        // Skip commits with too few or too many files
        if (files.length < 2 || files.length > 50) {
          continue;
        }

        totalCommits++;

        // Count individual file changes
        for (const file of files) {
          fileChangeCounts.set(file, (fileChangeCounts.get(file) ?? 0) + 1);
        }

        // Count co-occurrences for all pairs
        for (let i = 0; i < files.length; i++) {
          for (let j = i + 1; j < files.length; j++) {
            const key = files[i]! < files[j]! ? `${files[i]}|${files[j]}` : `${files[j]}|${files[i]}`;
            cochangeCounts.set(key, (cochangeCounts.get(key) ?? 0) + 1);
          }
        }
      }
    } catch {
      return [];
    }

    if (totalCommits === 0) {
      return [];
    }

    // Convert to relationships, filtering by minimum co-occurrence
    const relationships: FileRelationship[] = [];

    for (const [key, count] of cochangeCounts) {
      if (count < 2) {
        continue;
      }

      const [fileA, fileB] = key.split('|');
      if (!fileA || !fileB) continue;

      // Calculate strength as Jaccard coefficient
      const countA = fileChangeCounts.get(fileA) ?? 0;
      const countB = fileChangeCounts.get(fileB) ?? 0;
      const union = countA + countB - count;
      const strength = union > 0 ? count / union : 0;

      if (strength >= minCooccurrence) {
        relationships.push(createGitCochangeRelationship([fileA, fileB], strength, count));
      }
    }

    // Sort by strength
    relationships.sort((a, b) => b.strength - a.strength);

    return relationships;
  }

  /** Extract bug fixes from commit messages */
  async extractBugFixes(since: Date | null): Promise<BugFix[]> {
    const bugFixes: BugFix[] = [];

    try {
      // Get commits with extended message
      const sinceArg = since ? `--since="${since.toISOString()}"` : '';
      const format = '%H|%at|%an|%s';
      const log = await this.gitExec(`log --format="${format}" ${sinceArg}`);

      for (const line of log.split('\n')) {
        if (!line) continue;
        const parts = line.split('|');
        if (parts.length < 4) continue;

        const [sha, timestampStr, author, ...messageParts] = parts;
        const message = messageParts.join('|');
        const messageLower = message.toLowerCase();

        // Check for bug fix patterns
        const isFix =
          messageLower.startsWith('fix:') ||
          messageLower.startsWith('fix(') ||
          messageLower.startsWith('bugfix:') ||
          messageLower.startsWith('bugfix(') ||
          messageLower.startsWith('hotfix:') ||
          messageLower.startsWith('hotfix(') ||
          messageLower.includes('fixes #') ||
          messageLower.includes('closes #') ||
          messageLower.includes('resolves #');

        if (!isFix) {
          continue;
        }

        // Extract description
        const colonIdx = message.indexOf(':');
        const symptom = colonIdx !== -1 ? message.slice(colonIdx + 1).trim() : message;

        // Determine severity
        let severity = BugSeverity.Medium;
        if (
          messageLower.includes('critical') ||
          messageLower.includes('security') ||
          messageLower.includes('crash')
        ) {
          severity = BugSeverity.Critical;
        } else if (messageLower.includes('hotfix') || messageLower.includes('urgent')) {
          severity = BugSeverity.High;
        } else if (messageLower.includes('minor') || messageLower.includes('typo')) {
          severity = BugSeverity.Low;
        }

        // Extract issue link
        let issueLink: string | undefined;
        const issueMatch = message.match(/#(\d+)/);
        if (issueMatch) {
          issueLink = `#${issueMatch[1]}`;
        }

        // Get files changed
        const filesOutput = await this.gitExec(`diff-tree --no-commit-id --name-only -r ${sha}`);
        const filesChanged = filesOutput.split('\n').filter(f => f);

        bugFixes.push(
          createBugFix(symptom, 'See commit for details', symptom, sha!, {
            filesChanged,
            issueLink,
            severity,
            discoveredBy: author,
            tags: ['auto-detected'],
          })
        );
      }
    } catch {
      // Return empty on error
    }

    return bugFixes;
  }

  /** Analyze the full git history and return discovered knowledge */
  async analyzeHistory(since: Date | null): Promise<HistoryAnalysis> {
    // Extract bug fixes
    const bugFixes = await this.extractBugFixes(since);

    // Find co-change patterns
    const fileRelationships = await this.findCochangePatterns(since, 0.3);

    // Get recent commits for stats
    const recentCommits = await this.getRecentCommits(50);

    // Calculate activity stats
    const authorCounts = new Map<string, number>();
    const fileCounts = new Map<string, number>();

    for (const commit of recentCommits) {
      authorCounts.set(commit.author, (authorCounts.get(commit.author) ?? 0) + 1);
      for (const file of commit.filesChanged) {
        fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
      }
    }

    // Top contributors
    const topContributors = Array.from(authorCounts.entries())
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Hot files
    const hotFiles = Array.from(fileCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      bugFixes,
      fileRelationships,
      commitCount: recentCommits.length,
      topContributors,
      hotFiles,
      analyzedSince: since,
    };
  }

  /** Get files changed since a specific commit */
  async getFilesChangedSince(commitSha: string): Promise<string[]> {
    try {
      const output = await this.gitExec(`diff --name-only ${commitSha}..HEAD`);
      return output.split('\n').filter(f => f);
    } catch {
      return [];
    }
  }
}
