#!/bin/bash
# ──────────────────────────────────────────────────────────────
#  CascadeGuard — Start Script
#  Launches backend (FastAPI) and frontend (Vite) together.
# ──────────────────────────────────────────────────────────────

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_PYTHON="$PROJECT_DIR/venv/bin/python"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# ── Load environment variables from .env ────────────────────────
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

# ── Colors ──────────────────────────────────────────────────────
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
NC="\033[0m"

echo -e "${CYAN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║   CascadeGuard — AI Failure Propagation Intel    ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── Kill previous instances ─────────────────────────────────────
echo -e "${YELLOW}[1/3] Stopping previous instances...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# ── Start Backend ───────────────────────────────────────────────
echo -e "${YELLOW}[2/3] Starting backend (FastAPI on :8000)...${NC}"
cd "$BACKEND_DIR"
$VENV_PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
sleep 1

# ── Start Frontend ──────────────────────────────────────────────
echo -e "${YELLOW}[3/3] Starting frontend (Vite on :5173)...${NC}"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

# ── Wait for startup ───────────────────────────────────────────
sleep 5
echo ""
echo -e "${GREEN}  ✅ Backend running  → http://localhost:8000${NC}"
echo -e "${GREEN}  ✅ Frontend running → http://localhost:5173${NC}"
echo ""
echo -e "${CYAN}  Press Ctrl+C to stop both servers.${NC}"
echo ""

# ── Graceful shutdown ───────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    echo -e "${GREEN}Done.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Keep script alive
wait
