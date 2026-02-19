#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

( cd "$SCRIPT_DIR/backend" && poetry run uvicorn app.main:app --reload ) &
BACKEND_PID=$!

( cd "$SCRIPT_DIR/web-client" && npm run dev ) &
WEB_PID=$!

trap 'kill $BACKEND_PID $WEB_PID' INT TERM EXIT
wait $BACKEND_PID $WEB_PID
