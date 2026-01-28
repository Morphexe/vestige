/**
 * MCP Protocol Messages
 *
 * Request and response types for MCP methods.
 */

// ============================================================================
// INITIALIZE
// ============================================================================

/** Initialize request from client */
export interface InitializeRequest {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: ClientInfo;
}

export interface ClientCapabilities {
  roots?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
}

export interface ClientInfo {
  name: string;
  version: string;
}

/** Default initialize request */
export function createDefaultInitializeRequest(): InitializeRequest {
  return {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'unknown',
      version: '0.0.0',
    },
  };
}

/** Initialize response to client */
export interface InitializeResult {
  protocolVersion: string;
  serverInfo: ServerInfo;
  capabilities: ServerCapabilities;
  instructions?: string;
}

export interface ServerInfo {
  name: string;
  version: string;
}

export interface ServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

// ============================================================================
// TOOLS
// ============================================================================

/** Tool description for tools/list */
export interface ToolDescription {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** Result of tools/list */
export interface ListToolsResult {
  tools: ToolDescription[];
}

/** Request for tools/call */
export interface CallToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/** Result of tools/call */
export interface CallToolResult {
  content: ToolResultContent[];
  isError?: boolean;
}

export interface ToolResultContent {
  type: string;
  text: string;
}

/** Create a successful tool result */
export function createToolResult(content: unknown, isError = false): CallToolResult {
  const text =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}

/** Create an error tool result */
export function createToolError(error: string): CallToolResult {
  return createToolResult({ error }, true);
}

// ============================================================================
// RESOURCES
// ============================================================================

/** Resource description for resources/list */
export interface ResourceDescription {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/** Result of resources/list */
export interface ListResourcesResult {
  resources: ResourceDescription[];
}

/** Request for resources/read */
export interface ReadResourceRequest {
  uri: string;
}

/** Result of resources/read */
export interface ReadResourceResult {
  contents: ResourceContent[];
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}
