#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi

.venv/bin/python -c 'import dotenv, elasticsearch, fastapi, openai, sentence_transformers, uvicorn' 2>/dev/null || \
  .venv/bin/python -m pip install -r requirements.txt

export ECO_INDEX_NAME="${ECO_INDEX_NAME:-eco-jupjup-vector-v2}"
exec .venv/bin/python -m uvicorn main:app --app-dir ai-server --host 127.0.0.1 --port "${AI_SERVER_PORT:-8000}"
