/**
 * Bun Standalone Server Example
 *
 * Minimal Vestige MCP server using Bun's native HTTP server.
 * No external framework required.
 *
 * Run:
 * ```bash
 * TURSO_DATABASE_URL=libsql://your-db.turso.io TURSO_AUTH_TOKEN=xxx bun run server.ts
 * ```
 */

import { createTursoAdapter, createVestigeHttpServer } from '../index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = parseInt(process.env['PORT'] ?? '3000');
const DEBUG = process.env['NODE_ENV'] === 'development';

// ============================================================================
// INITIALIZE
// ============================================================================

console.log('Initializing Vestige server...');

const db = createTursoAdapter({
  url: process.env['TURSO_DATABASE_URL']!,
  authToken: process.env['TURSO_AUTH_TOKEN'],
  debug: DEBUG,
});

await db.initialize();
console.log('Database initialized');

const vestige = await createVestigeHttpServer({
  database: db,
  name: 'vestige-standalone',
  version: '1.0.0',
  debug: DEBUG,
});

console.log('Vestige server ready');

// ============================================================================
// HTTP SERVER
// ============================================================================

const server = Bun.serve({
  port: PORT,

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (path === '/health' && request.method === 'GET') {
      return Response.json(
        { status: 'ok', vestige: 'ready' },
        { headers: corsHeaders }
      );
    }

    // MCP endpoint
    if (path === '/mcp' && request.method === 'POST') {
      const response = await vestige.handleWebRequest(request);

      // Add CORS headers to response
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    // Simple REST endpoints (optional convenience layer)
    if (path.startsWith('/api/')) {
      return handleRestApi(request, path, corsHeaders);
    }

    // 404
    return Response.json(
      { error: 'Not found', path },
      { status: 404, headers: corsHeaders }
    );
  },
});

console.log(`
╔════════════════════════════════════════════════════════════╗
║                    VESTIGE MCP SERVER                      ║
╠════════════════════════════════════════════════════════════╣
║  Status:  Running                                          ║
║  Port:    ${PORT.toString().padEnd(48)}║
║                                                            ║
║  Endpoints:                                                ║
║    POST /mcp           - MCP JSON-RPC endpoint             ║
║    GET  /health        - Health check                      ║
║    POST /api/memories  - Store memory (REST)               ║
║    GET  /api/search    - Search memories (REST)            ║
║    GET  /api/due       - Get due reviews (REST)            ║
║    POST /api/review    - Review memory (REST)              ║
║    GET  /api/stats     - Get statistics (REST)             ║
╚════════════════════════════════════════════════════════════╝
`);

// ============================================================================
// REST API HANDLER
// ============================================================================

async function handleRestApi(
  request: Request,
  path: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const url = new URL(request.url);

    // POST /api/memories - Store memory
    if (path === '/api/memories' && request.method === 'POST') {
      const body = await request.json();
      const result = await callTool('ingest', body);
      return Response.json(result, { headers: corsHeaders });
    }

    // GET /api/search?q=query&limit=10 - Search memories
    if (path === '/api/search' && request.method === 'GET') {
      const query = url.searchParams.get('q') ?? '';
      const limit = parseInt(url.searchParams.get('limit') ?? '10');
      const result = await callTool('recall', { query, limit });
      return Response.json(result, { headers: corsHeaders });
    }

    // GET /api/due?limit=10 - Get due reviews
    if (path === '/api/due' && request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') ?? '10');
      const result = await callTool('due', { limit });
      return Response.json(result, { headers: corsHeaders });
    }

    // POST /api/review - Review memory
    if (path === '/api/review' && request.method === 'POST') {
      const body = await request.json();
      const result = await callTool('review', body);
      return Response.json(result, { headers: corsHeaders });
    }

    // GET /api/stats - Get statistics
    if (path === '/api/stats' && request.method === 'GET') {
      const result = await callTool('stats', {});
      return Response.json(result, { headers: corsHeaders });
    }

    // POST /api/decay - Apply decay
    if (path === '/api/decay' && request.method === 'POST') {
      const result = await callTool('decay', {});
      return Response.json(result, { headers: corsHeaders });
    }

    return Response.json(
      { error: 'Not found', path },
      { status: 404, headers: corsHeaders }
    );
  } catch (error) {
    console.error('REST API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function callTool(name: string, args: unknown): Promise<unknown> {
  const mcpRequest = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  const response = await vestige.handleWebRequest(mcpRequest);
  const result = await response.json() as { result?: unknown; error?: unknown };

  if (result.error) {
    throw new Error(JSON.stringify(result.error));
  }

  return result.result;
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  server.stop();
  await vestige.close();
  console.log('Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.stop();
  await vestige.close();
  process.exit(0);
});
