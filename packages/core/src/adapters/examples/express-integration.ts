/**
 * Express Integration Example
 *
 * This example shows how to integrate Vestige with Express.js.
 *
 * Install dependencies:
 * ```bash
 * npm install express @libsql/client
 * npm install -D @types/express
 * ```
 */

import express from 'express';
import { createTursoAdapter, createVestigeHttpServer } from '../index.js';

// ============================================================================
// SETUP
// ============================================================================

const app = express();
app.use(express.json());

// Initialize database and server (lazy)
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
app.get('/health', async (_req, res) => {
  await getVestige();
  res.json({ status: 'ok', vestige: 'ready' });
});

// MCP endpoint for AI agents
app.post('/mcp', async (req, res) => {
  try {
    const v = await getVestige();
    await v.handleNodeRequest(req, res);
  } catch (error) {
    console.error('MCP error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optional: REST API wrapper
app.post('/api/memories', async (req, res) => {
  try {
    const v = await getVestige();

    // Direct tool call
    const mcpBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'ingest',
        arguments: req.body,
      },
    };

    // Create a mock request/response for internal handling
    const result = await callMcpTool(v, mcpBody);
    res.json(result);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

app.get('/api/memories/search', async (req, res) => {
  try {
    const v = await getVestige();
    const query = (req.query['q'] as string) ?? '';
    const limit = parseInt((req.query['limit'] as string) ?? '10');

    const result = await callMcpTool(v, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'recall',
        arguments: { query, limit },
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/memories/due', async (req, res) => {
  try {
    const v = await getVestige();
    const limit = parseInt((req.query['limit'] as string) ?? '10');

    const result = await callMcpTool(v, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'due',
        arguments: { limit },
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Due error:', error);
    res.status(500).json({ error: 'Failed to get due memories' });
  }
});

app.post('/api/memories/:id/review', async (req, res) => {
  try {
    const v = await getVestige();
    const { id } = req.params;
    const { grade } = req.body;

    const result = await callMcpTool(v, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'review',
        arguments: { id, grade },
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Review failed' });
  }
});

app.get('/api/stats', async (_req, res) => {
  try {
    const v = await getVestige();

    const result = await callMcpTool(v, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'stats',
        arguments: {},
      },
    });

    res.json(result);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================================================
// HELPERS
// ============================================================================

async function callMcpTool(
  v: Awaited<ReturnType<typeof createVestigeHttpServer>>,
  body: unknown
): Promise<unknown> {
  const request = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const response = await v.handleWebRequest(request);
  const result = await response.json() as { result?: unknown; error?: unknown };

  if (result.error) {
    throw new Error(JSON.stringify(result.error));
  }

  return result.result;
}

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env['PORT'] ?? 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`REST API: http://localhost:${PORT}/api/*`);
});

export default app;
