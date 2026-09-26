// ==============================================================================
// src/mcp/transport/stdio-rpc.ts — Stdio JSON-RPC 2.0 Server Transport Façade
// ==============================================================================

import { McpDispatcher } from '../dispatcher/mcp-dispatcher.js';
export * from './stdio-transport.js';
export * from '../dispatcher/mcp-dispatcher.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface StdioRpcOptions {
  toolsManifest: any[];
  handleToolCall: (name: string, args: any, log: (...args: any[]) => void) => Promise<any>;
}

/**
 * Starts Stdio MCP JSON-RPC 2.0 server with non-blocking event loop dispatcher.
 */
export function startStdioRpc(options: StdioRpcOptions): void {
  const dispatcher = new McpDispatcher({
    toolsManifest: options.toolsManifest,
    handleToolCall: options.handleToolCall
  });
  dispatcher.start();
}
