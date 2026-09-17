#!/bin/sh
# Prepare the local team's database and apply versioned SQL through Spring/Flyway.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
python3 scripts/setup-local.py
docker compose up -d --build --wait postgres backend
printf '%s\n' 'Team PostgreSQL and Spring ready. Flyway schema: app. Existing volumes retained.'
