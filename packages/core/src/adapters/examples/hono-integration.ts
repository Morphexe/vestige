/**
 * Hono Integration Example
 *
 * This example shows how to integrate Vestige with Hono framework.
 * Works with Bun, Deno, Cloudflare Workers, and Node.js.
 *
 * Install dependencies:
 * ```bash
 * bun add hono @libsql/client
 * ```
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createTursoAdapter, createVestigeHttpServer } from '../index.js';

// ============================================================================
// SETUP
// ============================================================================

const app = new Hono();

// Enable CORS for cross-origin requests
app.use('/*', cors());

// Initialize database and server
let vestige: Awaited<ReturnType<typeof createVestigeHttpServer>> | null = null;

async function getVestige() {
  if (!vestige) {
    const db = createTursoAdapter({
      url: process.env['TURSO_DATABASE_URL']!,
      authToken: process.env['TURSO_AUTH_TOKEN'],
      debug: process.env['NODE_ENV'] === 'development',
    });

    await db.initialize();

    vestige = await createVestigeHttpServer({
      database: db,
      name: 'my-app-memory',
      version: '1.0.0',
      debug: process.env['NODE_ENV'] === 'development',
    });
  }
  return vestige;
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get('/health', async (c) => {
  const v = await getVestige();
  return c.json({ status: 'ok', vestige: 'ready' });
});

// MCP endpoint for AI agents
app.post('/mcp', async (c) => {
  const v = await getVestige();
  return v.handleWebRequest(c.req.raw);
});

// Optional: REST API wrapper for non-MCP clients
app.post('/api/memories', async (c) => {
  const body = await c.req.json();
  const v = await getVestige();

  // Convert REST to MCP call
  const mcpRequest = new Request(c.req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ingest',
        arguments: body,
      },
    }),
  });

  const response = await v.handleWebRequest(mcpRequest);
  const result = await response.json();

  return c.json(result.result ?? result.error);
});

app.get('/api/memories/search', async (c) => {
  const query = c.req.query('q') ?? '';
  const limit = parseInt(c.req.query('limit') ?? '10');
  const v = await getVestige();

  const mcpRequest = new Request(c.req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'recall',
        arguments: { query, limit },
      },
    }),
  });

  const response = await v.handleWebRequest(mcpRequest);
  const result = await response.json();

  return c.json(result.result ?? result.error);
});

app.get('/api/memories/due', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '10');
  const v = await getVestige();

  const mcpRequest = new Request(c.req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'due',
        arguments: { limit },
      },
    }),
  });

  const response = await v.handleWebRequest(mcpRequest);
  const result = await response.json();

  return c.json(result.result ?? result.error);
});

app.post('/api/memories/:id/review', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const v = await getVestige();

  const mcpRequest = new Request(c.req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'review',
        arguments: { id, grade: body.grade },
      },
    }),
  });

  const response = await v.handleWebRequest(mcpRequest);
  const result = await response.json();

  return c.json(result.result ?? result.error);
});

app.get('/api/stats', async (c) => {
  const v = await getVestige();

  const mcpRequest = new Request(c.req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'stats',
        arguments: {},
      },
    }),
  });

  const response = await v.handleWebRequest(mcpRequest);
  const result = await response.json();

  return c.json(result.result ?? result.error);
});

// ============================================================================
// EXPORT
// ============================================================================

export default app;

// For Bun
// export default { port: 3000, fetch: app.fetch };

// For Cloudflare Workers
// export default app;
