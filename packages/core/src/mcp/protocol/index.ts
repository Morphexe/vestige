/**
 * MCP Protocol Module
 *
 * JSON-RPC 2.0 types and transport for MCP.
 */

export {
  // Constants
  MCP_VERSION,
  JSONRPC_VERSION,
  // Types
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  // Error codes
  ErrorCode,
  // Functions
  createSuccessResponse,
  createErrorResponse,
  createError,
  Errors,
  isJsonRpcRequest,
  isNotification,
} from './types.js';

export {
  // Initialize types
  type InitializeRequest,
  type InitializeResult,
  type ClientCapabilities,
  type ClientInfo,
  type ServerInfo,
  type ServerCapabilities,
  createDefaultInitializeRequest,
  // Tool types
  type ToolDescription,
  type ListToolsResult,
  type CallToolRequest,
  type CallToolResult,
  type ToolResultContent,
  createToolResult,
  createToolError,
  // Resource types
  type ResourceDescription,
  type ListResourcesResult,
  type ReadResourceRequest,
  type ReadResourceResult,
  type ResourceContent,
} from './messages.js';

export { StdioTransport } from './stdio.js';
