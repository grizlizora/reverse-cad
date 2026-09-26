// ==============================================================================
// src/mcp/dispatcher/mcp-dispatcher.ts — High-Performance Zero-Blocking MCP Dispatcher
// ==============================================================================

import { StdioTransport } from '../transport/stdio-transport.js';

export interface McpToolManifest {
  name: string;
  description: string;
  inputSchema: any;
}

export interface McpDispatcherOptions {
  toolsManifest: McpToolManifest[];
  handleToolCall: (name: string, args: any, log: (...args: any[]) => void) => Promise<any>;
}

export class McpDispatcher {
  private transport: StdioTransport;
  private options: McpDispatcherOptions;

  constructor(options: McpDispatcherOptions) {
    this.options = options;
    this.transport = new StdioTransport();
  }

  public start(): void {
    this.transport.initialize(async (line: string) => {
      await this.dispatchLine(line);
    });
  }

  private async dispatchLine(line: string): Promise<void> {
    let req: any;
    try {
      req = JSON.parse(line);
    } catch {
      this.transport.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      });
      return;
    }

    if (!req || typeof req !== 'object') return;
    const isNotification = req.id === undefined || req.id === null;

    switch (req.method) {
      case 'ping':
        // Instant response in < 0.2ms
        if (!isNotification) {
          this.transport.send({ jsonrpc: '2.0', id: req.id, result: {} });
        }
        break;

      case 'initialize':
        if (!isNotification) {
          this.transport.send({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: {
                name: 'cad-reverse-engineering-mcp',
                version: '1.0.0'
              }
            }
          });
        }
        break;

      case 'notifications/initialized':
        // Client ack, no response needed
        break;

      case 'tools/list':
        if (!isNotification) {
          this.transport.send({
            jsonrpc: '2.0',
            id: req.id,
            result: { tools: this.options.toolsManifest }
          });
        }
        break;

      case 'tools/call': {
        if (isNotification) break;
        const { name, arguments: args } = req.params || {};
        try {
          const result = await this.options.handleToolCall(name, args, (...logArgs) => {
            process.stderr.write(`[CAD-MCP] ${logArgs.join(' ')}\n`);
          });
          this.transport.send({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
            }
          });
        } catch (err: any) {
          this.transport.send({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              isError: true,
              content: [{ type: 'text', text: `Tool error: ${err?.message || String(err)}` }]
            }
          });
        }
        break;
      }

      default:
        if (!isNotification) {
          this.transport.send({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: `Method not found: ${req.method}` }
          });
        }
        break;
    }
  }
}
