#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

output="$("$ROOT_DIR/scripts/run-min-evals.sh" --self-test 2>&1)" || {
  printf '%s\n' "$output"
  exit 1
}

printf '%s\n' "$output" | rg -q "SELF-TEST PASS"
printf 'run-min-evals self-test harness: PASS\n'
