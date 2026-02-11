#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
run-pi-filesystem-smoke.sh - Local smoke checks for PI filesystem tools.

Usage:
  ./scripts/run-pi-filesystem-smoke.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running PI filesystem smoke checks..."
pnpm test \
  src/lib/pi-filesystem-tools.smoke.test.ts \
  src/app/api/chat/pi-filesystem.route.integration.test.ts
echo "PI filesystem smoke checks passed."
