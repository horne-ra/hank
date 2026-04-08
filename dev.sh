#!/usr/bin/env bash
#
# dev.sh — Run Hank locally for development.
#
# Starts all three services (token server, agent worker, frontend) in parallel
# with prefixed output. Press Ctrl+C to stop everything cleanly.
#
# Requirements: macOS or Linux. Bash 4+. uv, pnpm, Python 3.11+, Node 20+.
# Windows users: please use Docker (`docker compose up --build`).

set -euo pipefail

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for prefixes (used only in output prefixes, no formatting elsewhere)
PREFIX_TOKEN="[token-server]"
PREFIX_AGENT="[agent-worker]"
PREFIX_FRONTEND="[frontend]    "

# --- Prerequisite checks ---

check_command() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: '$cmd' not found in PATH."
    echo "  Install: $install_hint"
    exit 1
  fi
}

echo "Checking prerequisites..."
check_command uv "https://docs.astral.sh/uv/getting-started/installation/"
check_command pnpm "npm install -g pnpm  (or visit https://pnpm.io/installation)"
check_command python3 "Install Python 3.11+ from https://www.python.org/ or your package manager"
check_command node "Install Node 20+ from https://nodejs.org/ or your package manager"

# Verify Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 11 ]; }; then
  echo "ERROR: Python 3.11+ required, found $PYTHON_VERSION"
  exit 1
fi

# Verify Node version
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node 20+ required, found $(node -v)"
  exit 1
fi

# --- .env check ---

if [ ! -f .env ]; then
  echo "ERROR: .env file not found at project root."
  echo "  Run: cp .env.example .env"
  echo "  Then edit .env and fill in your LiveKit and OpenAI keys."
  exit 1
fi

# Check required env vars
REQUIRED_VARS=(LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY)
MISSING_VARS=()
# Source .env to check (only export the ones we need to check)
set -a
# shellcheck disable=SC1091
source .env
set +a

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo "ERROR: Missing required environment variables in .env:"
  for v in "${MISSING_VARS[@]}"; do
    echo "  - $v"
  done
  echo "  Edit .env and set the missing values."
  exit 1
fi

# --- Install dependencies if needed ---

if [ ! -d backend/.venv ]; then
  echo "Installing backend dependencies..."
  (cd backend && uv sync)
fi

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies..."
  (cd frontend && pnpm install)
fi

# --- Ensure data directory exists ---

mkdir -p backend/data

# --- Start services ---

echo ""
echo "Starting Hank services..."
echo "  Token server:  http://localhost:8000"
echo "  Frontend:      http://localhost:3000"
echo "  Press Ctrl+C to stop everything."
echo ""

# Track child PIDs for cleanup
PIDS=()

cleanup() {
  echo ""
  echo "Stopping services..."
  for pid in "${PIDS[@]}"; do
    # Kill the entire process group (negative PID) so child processes
    # spawned by the subshell (uvicorn, agent worker, pnpm) are included.
    kill -- -"$pid" 2>/dev/null || true
  done
  # Give them a moment to exit cleanly
  sleep 1
  for pid in "${PIDS[@]}"; do
    kill -9 -- -"$pid" 2>/dev/null || true
  done
  exit 0
}

trap cleanup EXIT INT TERM

# Start token server with prefixed output
(
  cd backend
  uv run uvicorn token_server:app --host 0.0.0.0 --port 8000 --reload 2>&1 | sed "s/^/$PREFIX_TOKEN /"
) &
PIDS+=($!)

# Wait for token server to be ready
echo "Waiting for token server..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/healthz >/dev/null 2>&1; then
    echo "Token server ready."
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "WARNING: Token server not responding after 20s, starting agent anyway."
  fi
  sleep 1
done

# Start agent worker with prefixed output
(
  cd backend
  uv run python -m agent.worker dev 2>&1 | sed "s/^/$PREFIX_AGENT /"
) &
PIDS+=($!)

# Start frontend with prefixed output
(
  cd frontend
  pnpm dev 2>&1 | sed "s/^/$PREFIX_FRONTEND /"
) &
PIDS+=($!)

# Wait for any of them to exit
wait
