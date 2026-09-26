#!/bin/sh
# ==============================================================================
# convert.sh — Ultra-Resilient 3D Reverse-Engineering Pipeline Runner (STL -> STEP + JSON)
# 100% Portable across macOS (Apple Silicon / Intel, Bash 3.2+/sh/zsh) & Linux
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
ORIGINAL_PWD="$(pwd)"

# Guaranteed terminal cursor restoration on any exit or Ctrl+C
cleanup_terminal() {
  tput cnorm 2>/dev/null || printf '\033[?25h'
}
trap cleanup_terminal INT TERM EXIT

# Disable core dumps
ulimit -c 0 2>/dev/null || true

# Direct logs to stderr so stdout is 100% clean for JSON-RPC / MCP and pipelines
log_info()  { printf '\033[36m[INFO]\033[0m %s\n' "$1" >&2; }
log_warn()  { printf '\033[33m[WARN]\033[0m %s\n' "$1" >&2; }
log_error() { printf '\033[31m[ERROR]\033[0m %s\n' "$1" >&2; }
log_success() { printf '\033[32m[SUCCESS]\033[0m %s\n' "$1" >&2; }

# 1. Runtime environment detection
RUNTIME=""
if command -v node >/dev/null 2>&1; then
  RUNTIME="node"
elif command -v bun >/dev/null 2>&1; then
  RUNTIME="bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
  RUNTIME="bun"
fi

if [ -z "$RUNTIME" ]; then
  log_error "Node.js (v20+) or Bun not detected. Please install Node.js or Bun."
  exit 1
fi

# 2. System resource calculation (macOS sysctl / Linux nproc)
TOTAL_MEM_BYTES=0
CPU_CORES=4

if [ "$(uname -s)" = "Darwin" ]; then
  TOTAL_MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo 0)
  CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
elif [ -f /proc/meminfo ]; then
  TOTAL_MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
  TOTAL_MEM_BYTES=$((TOTAL_MEM_KB * 1024))
  CPU_CORES=$(nproc 2>/dev/null || echo 4)
elif [ -n "$NUMBER_OF_PROCESSORS" ]; then
  # Windows Git Bash / MSYS2 / Cygwin environment
  CPU_CORES="$NUMBER_OF_PROCESSORS"
  TOTAL_MEM_BYTES=8589934592
fi

TOTAL_MEM_MB=$((TOTAL_MEM_BYTES / 1024 / 1024))
[ "$TOTAL_MEM_MB" -le 0 ] && TOTAL_MEM_MB=8192

# Safe memory limit calculation for Node.js Heap
HEAP_MB=$((TOTAL_MEM_MB * 60 / 100))
[ "$HEAP_MB" -gt 8192 ] && HEAP_MB=8192
[ "$HEAP_MB" -lt 2048 ] && HEAP_MB=2048

# 3. Dependency presence check
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  log_info "First run: Installing dependencies..."
  cd "$PROJECT_DIR"
  if command -v bun >/dev/null 2>&1; then
    bun install
  else
    npm install --no-audit --no-fund
  fi
fi

# 4. Check or compile TypeScript project
DIST_CLI="$PROJECT_DIR/dist/cli.js"
if [ ! -f "$DIST_CLI" ] || [ "$PROJECT_DIR/src" -nt "$DIST_CLI" ]; then
  log_info "Compiling TypeScript pipeline..."
  cd "$PROJECT_DIR"
  if [ -x "./node_modules/.bin/tsc" ]; then
    ./node_modules/.bin/tsc
  elif command -v bun >/dev/null 2>&1; then
    bun x tsc
  else
    npx tsc
  fi
  log_success "TypeScript compilation successfully completed."
fi

# 5. Native C++ OCCT engine check (if Clang and Homebrew are present)
NATIVE_BIN="$PROJECT_DIR/build/occt_step_synth"
if [ ! -f "$NATIVE_BIN" ] && [ -f "$PROJECT_DIR/src/native/Makefile" ]; then
  if command -v brew >/dev/null 2>&1 && brew list opencascade >/dev/null 2>&1; then
    log_info "Building native OpenCASCADE AP242 engine..."
    make -C "$PROJECT_DIR/src/native" >/dev/null 2>&1 || log_warn "Native build skipped, falling back to embedded B-Rep generator."
  fi
fi

# 6. Configure V8 runtime flags
NODE_FLAGS="--max-old-space-size=$HEAP_MB --expose-gc"

# Test mode check
IS_TEST_MODE=0
for arg in "$@"; do
  if [ "$arg" = "--test" ]; then
    IS_TEST_MODE=1
    break
  fi
done

if [ "$IS_TEST_MODE" -eq 1 ]; then
  TARGET_SCRIPT="$PROJECT_DIR/dist/test/run-tests.js"
else
  TARGET_SCRIPT="$DIST_CLI"
fi

# Restore user's original working directory before execution
cd "$ORIGINAL_PWD"

if [ "$RUNTIME" = "node" ]; then
  exec node $NODE_FLAGS --stack-size=8192 "$TARGET_SCRIPT" "$@"
else
  exec bun run "$TARGET_SCRIPT" "$@"
fi

