#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# One-click startup for Linux / macOS
#   - Detect & activate virtual environment
#   - Port occupancy check & auto-switch
#   - Auto-open browser on successful startup
# ---------------------------------------------------------------------------

PYTHON_EXE=""
VENV_DIR=".venv"
NO_START="0"
BIND_HOST=""
PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --python)
      PYTHON_EXE="${2:-}"
      shift 2
      ;;
    --venv-dir)
      VENV_DIR="${2:-}"
      shift 2
      ;;
    --host)
      BIND_HOST="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --no-start)
      NO_START="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

step() { printf '\033[32m[start]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[start]\033[0m %s\n' "$1" >&2; }
err()  { printf '\033[31m[start]\033[0m %s\n' "$1" >&2; }

# ---------------------------------------------------------------------------
# 1. Detect Python
# ---------------------------------------------------------------------------
detect_python() {
  if [[ -n "$PYTHON_EXE" ]]; then
    echo "$PYTHON_EXE"; return
  fi
  for cand in python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then
      echo "$cand"; return
    fi
  done
  return 1
}

PY_BOOT="$(detect_python || true)"
if [[ -z "$PY_BOOT" ]]; then
  err "未检测到 Python，请先安装 Python 3.9+ 后重试"
  exit 1
fi
step "引导解释器: $PY_BOOT"

# ---------------------------------------------------------------------------
# 2. Virtual environment detection
# ---------------------------------------------------------------------------
VENV_PATH="$PROJECT_ROOT/$VENV_DIR"
if [[ -f "$VENV_PATH/bin/python" ]]; then
  PYTHON_CMD="$VENV_PATH/bin/python"
  step "使用虚拟环境解释器: $VENV_PATH/bin/python"
else
  PYTHON_CMD="$PY_BOOT"
  step "使用系统解释器: $PY_BOOT"
fi

# ---------------------------------------------------------------------------
# 3. Port occupancy check + auto-switch
# ---------------------------------------------------------------------------
resolve_default_port() {
  # Priority: --port flag > SERVER_PORT env > config.json > 8000
  if [[ -n "$PORT" ]]; then
    echo "$PORT"; return
  fi
  if [[ -n "${SERVER_PORT:-}" ]]; then
    echo "$SERVER_PORT"; return
  fi
  "$PYTHON_CMD" -c '
import json, os
try:
    with open(os.path.join(sys.argv[1], "config.json"), "r", encoding="utf-8") as f:
        cfg = json.load(f)
    print(int(cfg.get("system", {}).get("server_port", 8000)))
except Exception:
    print(8000)
' "$PROJECT_ROOT" 2>/dev/null || echo 8000
}

is_port_in_use() {
  "$PYTHON_CMD" -c "
import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.settimeout(0.5)
    s.connect(('127.0.0.1', port))
    s.close()
    sys.exit(0)  # in use
except Exception:
    s.close()
    sys.exit(1)  # free
" "$1" "$2"
}

DEFAULT_PORT="$(resolve_default_port)"
ACTUAL_PORT="$DEFAULT_PORT"

# If port is in use, find next available
while is_port_in_use "127.0.0.1" "$ACTUAL_PORT"; do
  warn "端口 $ACTUAL_PORT 已被占用，尝试下一个..."
  ACTUAL_PORT=$((ACTUAL_PORT + 1))
done

if [[ "$ACTUAL_PORT" -ne "$DEFAULT_PORT" ]]; then
  step "端口已从 $DEFAULT_PORT 切换到 $ACTUAL_PORT（原端口被占用）"
fi

export SERVER_PORT="$ACTUAL_PORT"
step "SERVER_PORT=$ACTUAL_PORT"

if [[ -n "$BIND_HOST" ]]; then
  export SERVER_HOST="$BIND_HOST"
  step "SERVER_HOST=$BIND_HOST"
fi

# ---------------------------------------------------------------------------
# 4. No-start check
# ---------------------------------------------------------------------------
if [[ "$NO_START" == "1" ]]; then
  step "参数检查完成（no-start），未启动服务"
  exit 0
fi

# ---------------------------------------------------------------------------
# 5. Start server in background, poll until ready, then open browser
# ---------------------------------------------------------------------------
ACCESS_HOST="127.0.0.1"
case "${SERVER_HOST:-}" in
  localhost|"") ACCESS_HOST="127.0.0.1" ;;
  *) ACCESS_HOST="$SERVER_HOST" ;;
esac
ACCESS_URL="http://$ACCESS_HOST:$ACTUAL_PORT"

step "启动后端服务: server.py（按 Ctrl+C 停止）"
step "面板地址: $ACCESS_URL"

# Run server in foreground
"$PYTHON_CMD" "$PROJECT_ROOT/server.py" &
SERVER_PID=$!

# Background: wait for port to become active, then open browser
(
  timeout 30 bash -c "
    while ! $PYTHON_CMD -c \"
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    s.settimeout(0.5)
    s.connect(('127.0.0.1', int(sys.argv[1])))
    s.close()
except Exception:
    sys.exit(1)
\" $ACTUAL_PORT 2>/dev/null; do sleep 0.5; done
  " 2>/dev/null && {
    if [[ "$OSTYPE" == "darwin"* ]]; then
      open "$ACCESS_URL" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$ACCESS_URL" 2>/dev/null || true
    elif command -v sensible-browser >/dev/null 2>&1; then
      sensible-browser "$ACCESS_URL" 2>/dev/null || true
    fi
    echo "[start] 已尝试打开浏览器: $ACCESS_URL"
  } || true
) &

# Wait for the server process
wait $SERVER_PID || true
