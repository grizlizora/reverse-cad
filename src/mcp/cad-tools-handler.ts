// ==============================================================================
// src/mcp/cad-tools-handler.ts — CAD Reverse Engineering MCP Tool Façade
// ==============================================================================

import { TOOLS_MANIFEST, validateToolParams } from './manifest/cad-tools-manifest.js';
import { executeCadTask } from './bridge/cad-worker-task.js';
import { McpWorkerBridge } from './worker-bridge.js';

export { TOOLS_MANIFEST, validateToolParams, executeCadTask };

const defaultBridge = new McpWorkerBridge();

/**
 * Backward-compatible entry point for executing MCP CAD tools.
 * Delegates to the non-blocking worker bridge.
 */
export async function handleToolCall(
  name: string,
  args: any,
  log: (...args: any[]) => void = (...msg) => process.stderr.write(`[CAD-MCP] ${msg.join(' ')}\n`)
): Promise<any> {
  return await defaultBridge.executeTool(name, args, log);
}
