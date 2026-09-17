#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
python3 scripts/setup-local.py
docker compose up -d --build --wait "$@"
