// ==============================================================================
// src/mcp/cad-mcp-server.ts — Zero-Dependency Stdio MCP Server for AI Assistants
// ==============================================================================

import { startStdioRpc } from './transport/stdio-rpc.js';
import { TOOLS_MANIFEST, handleToolCall } from './cad-tools-handler.js';

export * from './transport/stdio-rpc.js';
export * from './cad-tools-handler.js';
export * from './worker-bridge.js';

export async function startMcpServer(): Promise<void> {
  startStdioRpc({
    toolsManifest: TOOLS_MANIFEST,
    handleToolCall
  });
}
