#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

cleanup() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose up -d --wait

docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U auditspec -d auditspec \
  < schema.sql

docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U auditspec -d auditspec \
  < tests.sql
