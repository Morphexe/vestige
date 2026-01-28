import { defineConfig } from 'tsup';

export default defineConfig([
  // Main package with DTS
  {
    entry: [
      'src/index.ts',
      'src/cli.ts',
      'src/core/fsrs.ts',
      'src/core/database.ts',
    ],
    format: ['esm'],
    dts: false, // TODO: Re-enable when MCP SDK type compatibility with Zod 4 is resolved
    clean: true,
    sourcemap: true,
    target: 'node20',
    shims: true,
    external: [
      'bun:sqlite',
      'better-sqlite3',
      '@libsql/client',
    ],
  },
  // Adapters (no DTS - types exported from main package)
  {
    entry: [
      'src/adapters/index.ts',
      'src/adapters/turso-adapter.ts',
      'src/adapters/http-server.ts',
      'src/adapters/database-adapter.ts',
    ],
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'node20',
    shims: true,
    external: [
      'bun:sqlite',
      'better-sqlite3',
      '@libsql/client',
      '@modelcontextprotocol/sdk',
      'zod',
    ],
    outDir: 'dist/adapters',
  },
]);
