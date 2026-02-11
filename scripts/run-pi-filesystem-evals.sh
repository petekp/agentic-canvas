#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PHASE="all"

usage() {
  cat <<'USAGE'
run-pi-filesystem-evals.sh - Run phased PI filesystem evals.

Usage:
  ./scripts/run-pi-filesystem-evals.sh [--phase contract|readonly|mutation|adversarial|all]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)
      PHASE="${2:-}"
      shift 2
      ;;
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

case "$PHASE" in
  contract)
    echo "Running PI filesystem contract/path-safety evals..."
    pnpm test src/lib/pi-filesystem-tools.contract.test.ts
    ;;
  readonly)
    echo "Running PI filesystem read-only evals..."
    pnpm test src/lib/pi-filesystem-tools.readonly.test.ts
    ;;
  mutation)
    echo "Running PI filesystem mutation evals..."
    pnpm test src/lib/pi-filesystem-tools.mutation.test.ts
    ;;
  adversarial)
    echo "Running PI filesystem adversarial evals..."
    pnpm test \
      src/lib/pi-filesystem-tools.adversarial.test.ts \
      src/app/api/chat/pi-filesystem.adversarial.route.integration.test.ts
    ;;
  all)
    echo "Running all PI filesystem eval phases..."
    pnpm test \
      src/lib/pi-filesystem-tools.contract.test.ts \
      src/lib/pi-filesystem-tools.readonly.test.ts \
      src/lib/pi-filesystem-tools.mutation.test.ts \
      src/lib/pi-filesystem-tools.adversarial.test.ts \
      src/app/api/chat/pi-filesystem.adversarial.route.integration.test.ts
    ;;
  *)
    echo "Invalid phase: $PHASE (expected contract|readonly|mutation|adversarial|all)" >&2
    exit 1
    ;;
esac

echo "PI filesystem eval phase '$PHASE' passed."
