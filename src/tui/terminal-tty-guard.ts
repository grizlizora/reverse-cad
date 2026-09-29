// ==============================================================================
// src/tui/terminal-tty-guard.ts — TTY State & Cursor Lifecycle Guard
// ==============================================================================

export class TerminalTtyGuard {
  private static isCursorHidden = false;
  private static handlersInstalled = false;

  public static isInteractiveTTY(): boolean {
    const termRows = process.stdout?.rows || 30;
    return Boolean(
      process.stdout?.isTTY &&
      termRows >= 10 &&
      !process.env.CI
    );
  }

  public static hideCursor(): void {
    if (!this.isInteractiveTTY() || this.isCursorHidden) return;
    this.installSignalHooks();
    process.stdout.write('\x1b[?25l');
    this.isCursorHidden = true;
  }

  public static restoreCursor(): void {
    if (!this.isCursorHidden) return;
    try {
      process.stdout.write('\x1b[?25h\n');
    } catch {
      // Ignored if stream is already closed
    }
    this.isCursorHidden = false;
  }

  private static installSignalHooks(): void {
    if (this.handlersInstalled) return;
    this.handlersInstalled = true;

    const cleanup = () => {
      TerminalTtyGuard.restoreCursor();
    };

    // Standard process lifecycle
    process.once('exit', cleanup);

    // POSIX Signal Traps with proper exit codes
    const signalHandler = (sig: NodeJS.Signals, exitCode: number) => {
      cleanup();
      process.exit(exitCode);
    };

    process.once('SIGINT', () => signalHandler('SIGINT', 130));
    process.once('SIGTERM', () => signalHandler('SIGTERM', 143));
    process.once('SIGHUP', () => signalHandler('SIGHUP', 129));

    // Emergency crash dump recovery
    process.once('uncaughtExceptionMonitor', cleanup);
  }
}
