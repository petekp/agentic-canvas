#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
run-pi-phase2-smoke.sh - Release smoke checks for pi runtime endpoints.

Usage:
  ./scripts/run-pi-phase2-smoke.sh [options]

Options:
  --base-url <url>            Base app URL (default: PI_SMOKE_BASE_URL or http://127.0.0.1:3000)
  --expect-engine-source <s>  Expected diagnostics engine source: external|internal|any
                              (default: PI_SMOKE_EXPECT_ENGINE_SOURCE or external)
  --expect-engine-id <id>     Optional exact engine id assertion
  --allow-runtime-404         Allow /api/pi/runtime to return 404 and skip engine validation
  --chat-prompt <text>        Prompt used for /api/chat smoke request
  --expect-chat-text <text>   Optional text expected in chat SSE output
  --chat-timeout-sec <sec>    Curl max-time for chat request (default: 45)
  -h, --help                  Show help

Environment:
  PI_SMOKE_BASE_URL
  PI_SMOKE_EXPECT_ENGINE_SOURCE
  PI_SMOKE_EXPECT_ENGINE_ID
  PI_SMOKE_ALLOW_RUNTIME_404
  PI_SMOKE_CHAT_PROMPT
  PI_SMOKE_EXPECT_CHAT_TEXT
  PI_SMOKE_CHAT_TIMEOUT_SEC
  PI_RETENTION_API_TOKEN      Optional bearer token for /api/pi/retention
USAGE
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

BASE_URL="${PI_SMOKE_BASE_URL:-http://127.0.0.1:3000}"
EXPECT_ENGINE_SOURCE="${PI_SMOKE_EXPECT_ENGINE_SOURCE:-external}"
EXPECT_ENGINE_ID="${PI_SMOKE_EXPECT_ENGINE_ID:-}"
ALLOW_RUNTIME_404="${PI_SMOKE_ALLOW_RUNTIME_404:-0}"
CHAT_PROMPT="${PI_SMOKE_CHAT_PROMPT:-Reply with exactly two words.}"
EXPECT_CHAT_TEXT="${PI_SMOKE_EXPECT_CHAT_TEXT:-}"
CHAT_TIMEOUT_SEC="${PI_SMOKE_CHAT_TIMEOUT_SEC:-45}"
RETENTION_TOKEN="${PI_RETENTION_API_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --expect-engine-source)
      EXPECT_ENGINE_SOURCE="$2"
      shift 2
      ;;
    --expect-engine-id)
      EXPECT_ENGINE_ID="$2"
      shift 2
      ;;
    --allow-runtime-404)
      ALLOW_RUNTIME_404="1"
      shift
      ;;
    --chat-prompt)
      CHAT_PROMPT="$2"
      shift 2
      ;;
    --expect-chat-text)
      EXPECT_CHAT_TEXT="$2"
      shift 2
      ;;
    --chat-timeout-sec)
      CHAT_TIMEOUT_SEC="$2"
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

if [[ "$EXPECT_ENGINE_SOURCE" != "external" && "$EXPECT_ENGINE_SOURCE" != "internal" && "$EXPECT_ENGINE_SOURCE" != "any" ]]; then
  echo "--expect-engine-source must be one of: external|internal|any" >&2
  exit 1
fi

require_cmd curl
require_cmd node

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Running pi phase-2 smoke checks against: $BASE_URL"

runtime_headers="$TMP_DIR/runtime.headers"
runtime_body="$TMP_DIR/runtime.json"
runtime_status="$(
  curl -sS \
    -D "$runtime_headers" \
    -o "$runtime_body" \
    -w "%{http_code}" \
    "$BASE_URL/api/pi/runtime"
)"

if [[ "$runtime_status" == "404" && "$ALLOW_RUNTIME_404" == "1" ]]; then
  echo "WARN runtime: /api/pi/runtime returned 404 (allowed by --allow-runtime-404)"
elif [[ "$runtime_status" != "200" ]]; then
  echo "FAIL runtime: HTTP $runtime_status"
  cat "$runtime_body"
  exit 1
else
  RUNTIME_BODY="$runtime_body" \
  EXPECT_ENGINE_SOURCE="$EXPECT_ENGINE_SOURCE" \
  EXPECT_ENGINE_ID="$EXPECT_ENGINE_ID" \
  node <<'NODE'
const fs = require("node:fs");

const body = JSON.parse(fs.readFileSync(process.env.RUNTIME_BODY, "utf8"));
const expectedSource = process.env.EXPECT_ENGINE_SOURCE;
const expectedId = process.env.EXPECT_ENGINE_ID;

if (!body || body.ok !== true || !body.diagnostics || !body.diagnostics.engine) {
  throw new Error("runtime diagnostics payload missing expected structure");
}

const engine = body.diagnostics.engine;
if (expectedSource !== "any" && engine.source !== expectedSource) {
  throw new Error(`runtime engine source mismatch: expected ${expectedSource}, got ${engine.source}`);
}
if (expectedId && engine.id !== expectedId) {
  throw new Error(`runtime engine id mismatch: expected ${expectedId}, got ${engine.id}`);
}
if (typeof engine.id !== "string" || engine.id.length === 0) {
  throw new Error("runtime engine id is empty");
}
NODE
  echo "PASS runtime: engine diagnostics validated"
fi

retention_headers="$TMP_DIR/retention.headers"
retention_body="$TMP_DIR/retention.json"
retention_args=(
  -sS
  -X POST
  -D "$retention_headers"
  -o "$retention_body"
  -w "%{http_code}"
  -H "content-type: application/json"
  -d "{\"nowMs\":$(date +%s000)}"
  "$BASE_URL/api/pi/retention"
)
if [[ -n "$RETENTION_TOKEN" ]]; then
  retention_args+=(-H "Authorization: Bearer $RETENTION_TOKEN")
fi
retention_status="$(curl "${retention_args[@]}")"

if [[ "$retention_status" != "200" ]]; then
  echo "FAIL retention: HTTP $retention_status"
  cat "$retention_body"
  exit 1
fi

RETENTION_BODY="$retention_body" node <<'NODE'
const fs = require("node:fs");

const body = JSON.parse(fs.readFileSync(process.env.RETENTION_BODY, "utf8"));
if (!body || body.ok !== true || typeof body.result !== "object" || body.result === null) {
  throw new Error("retention payload missing expected structure");
}
const requiredKeys = [
  "sessionsScanned",
  "snapshotsWritten",
  "episodesCompacted",
  "episodesDeleted",
  "ledgerDeleted",
  "snapshotsDeleted",
  "memoryDeleted",
];
for (const key of requiredKeys) {
  if (typeof body.result[key] !== "number") {
    throw new Error(`retention metric ${key} is not numeric`);
  }
}
NODE
echo "PASS retention: endpoint returned valid metrics"

chat_payload="$TMP_DIR/chat-request.json"
CHAT_PROMPT="$CHAT_PROMPT" node - "$chat_payload" <<'NODE'
const fs = require("node:fs");

const outputPath = process.argv[2];
const prompt = process.env.CHAT_PROMPT || "Reply with exactly two words.";
const now = Date.now();
const payload = {
  messages: [
    {
      id: `smoke-user-${now}`,
      role: "user",
      parts: [{ type: "text", text: prompt }],
    },
  ],
  canvas: {
    grid: { columns: 12, rows: 8 },
    components: [],
  },
  workspaceId: "ws_pi_smoke",
  threadId: `thread_pi_smoke_${now}`,
  activeSpaceId: "space_pi_smoke",
};
fs.writeFileSync(outputPath, JSON.stringify(payload), "utf8");
NODE

chat_headers="$TMP_DIR/chat.headers"
chat_body="$TMP_DIR/chat.sse"
chat_status="$(
  curl -sS -N \
    --max-time "$CHAT_TIMEOUT_SEC" \
    -D "$chat_headers" \
    -o "$chat_body" \
    -w "%{http_code}" \
    -H "content-type: application/json" \
    --data @"$chat_payload" \
    "$BASE_URL/api/chat"
)"

if [[ "$chat_status" != "200" ]]; then
  echo "FAIL chat: HTTP $chat_status"
  cat "$chat_body"
  exit 1
fi

if ! rg -qi '^content-type: .*text/event-stream' "$chat_headers"; then
  echo "FAIL chat: expected text/event-stream content type"
  cat "$chat_headers"
  exit 1
fi

CHAT_BODY="$chat_body" EXPECT_CHAT_TEXT="$EXPECT_CHAT_TEXT" node <<'NODE'
const fs = require("node:fs");

const raw = fs.readFileSync(process.env.CHAT_BODY, "utf8");
const expectText = process.env.EXPECT_CHAT_TEXT || "";

if (!/"type":"start"/.test(raw)) {
  throw new Error("chat stream missing start event");
}
if (!/"type":"finish"/.test(raw)) {
  throw new Error("chat stream missing finish event");
}
if (!/\[DONE\]/.test(raw)) {
  throw new Error("chat stream missing [DONE] terminator");
}
if (/"finishReason":"error"/.test(raw)) {
  throw new Error("chat stream finished with error");
}
if (expectText && !raw.includes(expectText)) {
  throw new Error(`chat stream missing expected text: ${expectText}`);
}
NODE
echo "PASS chat: SSE stream validated"

echo "PASS all: pi phase-2 smoke checks completed successfully"
