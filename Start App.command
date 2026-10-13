#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# 1. Kill any stale backend/frontend processes on ports 8080 or 3000
lsof -ti:8080 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 2. Start FastAPI Backend
PYTHONPATH=. ./venv/bin/python -m uvicorn backend.main:app --port 8080 > /tmp/gastro_backend.log 2>&1 &
BACKEND_PID=$!

# 3. Start Frontend
cd frontend
npm run dev -- --port 3000 > /tmp/gastro_frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$DIR"

# 4. Wait 2 seconds for services to start, then open in browser
sleep 2
open "http://localhost:3000"

echo "St Vincent's Gastro Roster App is running at http://localhost:3000"
echo "Close this window to stop the servers."

# Trap exit to cleanup background servers
trap "kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM EXIT
wait
