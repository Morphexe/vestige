/**
 * MCP JSON-RPC Types
 *
 * Core types for JSON-RPC 2.0 protocol used by MCP.
 */

/** MCP Protocol Version */
export const MCP_VERSION = '2025-11-25';

/** JSON-RPC version */
export const JSONRPC_VERSION = '2.0';

// ============================================================================
// JSON-RPC REQUEST/RESPONSE
// ============================================================================

/** JSON-RPC Request */
export interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: unknown;
}

/** JSON-RPC Response */
export interface JsonRpcResponse {
  jsonrpc: string;
  id?: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** Create a successful JSON-RPC response */
export function createSuccessResponse(
  id: string | number | null | undefined,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

/** Create an error JSON-RPC response */
export function createErrorResponse(
  id: string | number | null | undefined,
  error: JsonRpcError
): JsonRpcResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error,
  };
}

// ============================================================================
// JSON-RPC ERROR
// ============================================================================

/** JSON-RPC Error Codes (standard + MCP-specific) */
export enum ErrorCode {
  // Standard JSON-RPC errors
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,

  // MCP-specific errors (-32000 to -32099)
  ConnectionClosed = -32000,
  RequestTimeout = -32001,
  ResourceNotFound = -32002,
  ServerNotInitialized = -32003,
}

/** JSON-RPC Error */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Create a JSON-RPC error */
export function createError(code: ErrorCode, message: string, data?: unknown): JsonRpcError {
  return {
    code,
    message,
    ...(data !== undefined && { data }),
  };
}

/** Common error factories */
export const Errors = {
  parseError: () => createError(ErrorCode.ParseError, 'Parse error'),
  invalidRequest: (message = 'Invalid request') =>
    createError(ErrorCode.InvalidRequest, message),
  methodNotFound: (message = 'Method not found') =>
    createError(ErrorCode.MethodNotFound, message),
  invalidParams: (message: string) => createError(ErrorCode.InvalidParams, message),
  internalError: (message: string) => createError(ErrorCode.InternalError, message),
  serverNotInitialized: () =>
    createError(ErrorCode.ServerNotInitialized, 'Server not initialized'),
  resourceNotFound: (uri: string) =>
    createError(ErrorCode.ResourceNotFound, `Resource not found: ${uri}`),
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Check if a value is a valid JSON-RPC request */
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && typeof obj.method === 'string';
}

/** Check if a request is a notification (no id) */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === undefined || request.id === null;
}
