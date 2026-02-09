#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
query-telemetry.sh - Filter Agentic Canvas telemetry logs (JSONL).

Usage:
  ./scripts/query-telemetry.sh [--level info|warn|error] [--source regex] [--event regex]
                               [--contains regex] [--limit N] [--tail N]

Examples:
  ./scripts/query-telemetry.sh --level error --limit 50
  ./scripts/query-telemetry.sh --source "store\\.data" --event "fetch_error"
  ./scripts/query-telemetry.sh --contains "cmp_abc123"

Notes:
  - --source/--event/--contains accept regex.
  - --tail controls how many recent lines to scan before filtering (default 2000).
USAGE
}

LOG_PATH="${TELEMETRY_LOG_PATH:-.claude/telemetry/agentic-canvas.log}"
LEVEL=""
SOURCE=""
EVENT=""
CONTAINS=""
LIMIT=100
TAIL=2000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --level) LEVEL="${2:-}"; shift 2 ;;
    --source) SOURCE="${2:-}"; shift 2 ;;
    --event) EVENT="${2:-}"; shift 2 ;;
    --contains) CONTAINS="${2:-}"; shift 2 ;;
    --limit) LIMIT="${2:-}"; shift 2 ;;
    --tail) TAIL="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -f "$LOG_PATH" ]]; then
  echo "Log file not found: $LOG_PATH" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1 && ! command -v grep >/dev/null 2>&1; then
  echo "Neither rg nor grep is available for filtering." >&2
  exit 1
fi

FILTER_CMD="rg"
FILTER_ARGS=()
if ! command -v rg >/dev/null 2>&1; then
  FILTER_CMD="grep"
  FILTER_ARGS=(-E)
fi

stream="$(tail -n "$TAIL" "$LOG_PATH")"

if [[ -n "$LEVEL" ]]; then
  stream="$(printf '%s\n' "$stream" | $FILTER_CMD "${FILTER_ARGS[@]}" "\"level\":\"${LEVEL}\"")"
fi
if [[ -n "$SOURCE" ]]; then
  stream="$(printf '%s\n' "$stream" | $FILTER_CMD "${FILTER_ARGS[@]}" "\"source\":\"${SOURCE}\"")"
fi
if [[ -n "$EVENT" ]]; then
  stream="$(printf '%s\n' "$stream" | $FILTER_CMD "${FILTER_ARGS[@]}" "\"event\":\"${EVENT}\"")"
fi
if [[ -n "$CONTAINS" ]]; then
  stream="$(printf '%s\n' "$stream" | $FILTER_CMD "${FILTER_ARGS[@]}" "${CONTAINS}")"
fi

printf '%s\n' "$stream" | tail -n "$LIMIT"
