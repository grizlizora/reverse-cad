// ==============================================================================
// src/mcp/transport/stdio-transport.ts — Hardened Stdio JSON-RPC Transport
// ==============================================================================

import * as readline from 'readline';

export interface ITransportMessageReceiver {
  (line: string): Promise<void>;
}

export class StdioTransport {
  private rl: readline.Interface | null = null;

  public initialize(onMessage: ITransportMessageReceiver): void {
    // Redirect console logs to stderr so stdout is strictly JSON-RPC
    console.log = (...args: any[]) => process.stderr.write(`[CAD-MCP] ${args.join(' ')}\n`);
    console.info = (...args: any[]) => process.stderr.write(`[CAD-MCP] ${args.join(' ')}\n`);
    console.warn = (...args: any[]) => process.stderr.write(`[CAD-MCP-WARN] ${args.join(' ')}\n`);

    process.stdout.on('error', (err: any) => {
      if (err.code === 'EPIPE') process.exit(0);
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      terminal: false
    });

    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      onMessage(trimmed).catch(err => {
        process.stderr.write(`[CAD-MCP-ERR] Unhandled line error: ${err?.message || err}\n`);
      });
    });
  }

  public send(payload: object): void {
    const jsonStr = JSON.stringify(payload) + '\n';
    if (!process.stdout.write(jsonStr)) {
      // Drain handling
      process.stdout.once('drain', () => {});
    }
  }

  public close(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}
