/**
 * stdio Transport for MCP
 *
 * Handles JSON-RPC communication over stdin/stdout.
 */

import * as readline from 'readline';
import type { McpServer } from '../server.js';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  isJsonRpcRequest,
  createErrorResponse,
  Errors,
} from './types.js';

/**
 * stdio Transport for MCP server
 *
 * Reads JSON-RPC requests from stdin (one per line) and writes
 * responses to stdout.
 */
export class StdioTransport {
  private server: McpServer;
  private rl: readline.Interface | null = null;

  constructor(server: McpServer) {
    this.server = server;
  }

  /**
   * Start the transport, listening on stdin
   */
  async run(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    for await (const line of this.rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        // Parse JSON-RPC request
        const parsed = JSON.parse(line);

        if (!isJsonRpcRequest(parsed)) {
          this.sendResponse(createErrorResponse(null, Errors.parseError()));
          continue;
        }

        const request = parsed as JsonRpcRequest;

        // Handle the request
        const response = await this.server.handleRequest(request);

        // Send response (if not a notification)
        if (response) {
          this.sendResponse(response);
        }
      } catch (error) {
        // JSON parse error
        this.sendResponse(createErrorResponse(null, Errors.parseError()));
      }
    }
  }

  /**
   * Send a JSON-RPC response to stdout
   */
  private sendResponse(response: JsonRpcResponse): void {
    try {
      const json = JSON.stringify(response);
      console.log(json);
    } catch (error) {
      // Fallback error response if serialization fails
      const fallback = JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'Internal error' },
      });
      console.log(fallback);
    }
  }

  /**
   * Stop the transport
   */
  stop(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
