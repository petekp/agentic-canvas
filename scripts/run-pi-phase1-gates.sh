#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Running pi phase-1 contract gates..."

pnpm test src/lib/pi-adapter-contract.test.ts \
  src/lib/pi-phase1-adapter.test.ts \
  src/lib/pi-runtime.test.ts \
  src/lib/pi-retention.test.ts \
  src/app/api/pi/retention/route.test.ts \
  src/app/api/pi/runtime/route.test.ts \
  src/app/api/chat/route.test.ts \
  src/app/api/chat/pi-filesystem.route.integration.test.ts \
  src/app/api/chat/pi-mono.route.integration.test.ts \
  src/store/workspace-slice.morning-brief.test.ts \
  src/lib/morning-brief.test.ts

echo "pi phase-1 gates passed."
