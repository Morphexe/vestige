/**
 * Test Utilities Module
 *
 * Provides comprehensive testing utilities for Vestige:
 * - Time travel environment for temporal testing
 * - Database manager for isolated test databases
 * - Mock embedding service for deterministic embeddings
 * - Test data factory for generating fixtures
 * - Custom assertions for domain-specific testing
 */

// Harness utilities
export * from './harness/index.js';

// Mock implementations
export * from './mocks/index.js';

// Custom assertions
export * from './assertions/index.js';
