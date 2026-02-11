#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
run-min-evals.sh - Execute minimum assistant eval set via agent-browser + telemetry checks.

Usage:
  ./scripts/run-min-evals.sh [options]

Options:
  --eval-file <path>     Eval JSON file (default: .claude/evals/minimum-eval-set.v0.1.json)
  --app-url <url>        App base URL (default: http://localhost:3003)
  --space-url <url>      Specific space URL to open before each case (optional)
  --cases <ids>          Comma-separated case IDs (default: all)
  --wait-ms <ms>         Max wait per case for assistant completion (default: 20000)
  --session <name>       agent-browser session name (default: min-eval-<timestamp>)
  --list                 List available eval case IDs and exit
  -h, --help             Show help
USAGE
}

EVAL_FILE=".claude/evals/minimum-eval-set.v0.1.json"
APP_URL="http://localhost:3003"
SPACE_URL=""
CASES_ARG=""
WAIT_MS=20000
LIST_ONLY=0
SESSION="min-eval-$(date +%s)"
LOG_PATH="${TELEMETRY_LOG_PATH:-.claude/telemetry/agentic-canvas.log}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --eval-file) EVAL_FILE="${2:-}"; shift 2 ;;
    --app-url) APP_URL="${2:-}"; shift 2 ;;
    --space-url) SPACE_URL="${2:-}"; shift 2 ;;
    --cases) CASES_ARG="${2:-}"; shift 2 ;;
    --wait-ms) WAIT_MS="${2:-}"; shift 2 ;;
    --session) SESSION="${2:-}"; shift 2 ;;
    --list) LIST_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd jq
require_cmd rg
require_cmd agent-browser

if [[ ! -f "$EVAL_FILE" ]]; then
  echo "Eval file not found: $EVAL_FILE" >&2
  exit 1
fi

if [[ ! -f "$LOG_PATH" ]]; then
  echo "Telemetry log not found: $LOG_PATH" >&2
  exit 1
fi

if [[ "$LIST_ONLY" -eq 1 ]]; then
  jq -r '.cases[] | "\(.id)\t\(.category)\t\(.prompt)"' "$EVAL_FILE"
  exit 0
fi

RESULTS_DIR=".claude/evals/results"
mkdir -p "$RESULTS_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RESULT_JSON="$RESULTS_DIR/minimum-eval-results-$TIMESTAMP.json"
RESULT_MD="$RESULTS_DIR/minimum-eval-results-$TIMESTAMP.md"
TMP_DIR="$(mktemp -d)"

cleanup() {
  agent-browser --session "$SESSION" close >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ALL_CASE_IDS=()
while IFS= read -r id; do
  ALL_CASE_IDS+=("$id")
done < <(jq -r '.cases[].id' "$EVAL_FILE")

if [[ -n "$CASES_ARG" ]]; then
  IFS=',' read -r -a CASE_IDS <<<"$CASES_ARG"
else
  CASE_IDS=("${ALL_CASE_IDS[@]}")
fi

contains_case_id() {
  local target="$1"
  local id
  for id in "${ALL_CASE_IDS[@]}"; do
    if [[ "$id" == "$target" ]]; then
      return 0
    fi
  done
  return 1
}

for id in "${CASE_IDS[@]}"; do
  if ! contains_case_id "$id"; then
    echo "Unknown case ID: $id" >&2
    exit 1
  fi
done

navigate_to_eval_space() {
  local snapshot=""

  if [[ -n "$SPACE_URL" ]]; then
    agent-browser --session "$SESSION" open "$SPACE_URL" >/dev/null
    sleep 2
    snapshot="$(agent-browser --session "$SESSION" snapshot -d 8 || true)"
    if ! snapshot_is_space_canvas "$snapshot"; then
      agent-browser --session "$SESSION" open "$APP_URL/spaces" >/dev/null
      agent-browser --session "$SESSION" find text "Scratch" click >/dev/null 2>&1 || true
    fi
  else
    agent-browser --session "$SESSION" open "$APP_URL/spaces" >/dev/null
    agent-browser --session "$SESSION" find text "Scratch" click >/dev/null 2>&1 || true
  fi
}

extract_chat_ref_from_text() {
  local text="$1"
  printf '%s\n' "$text" | sed -n 's/.*textbox "Ask about your canvas\.\.\." \[ref=\(e[0-9][0-9]*\)\].*/\1/p' | head -n 1
}

get_chat_ref() {
  local snapshot
  snapshot="$(agent-browser --session "$SESSION" snapshot -d 8 || true)"
  if snapshot_is_space_canvas "$snapshot"; then
    extract_chat_ref_from_text "$snapshot"
  fi
}

snapshot_is_space_canvas() {
  local snapshot="$1"
  printf '%s\n' "$snapshot" | rg -q 'button "Back to Spaces"|button "Add Component"|paragraph: Canvas is empty'
}

wait_for_chat_ref() {
  local attempts=0
  local max_attempts=10
  local ref=""
  local snapshot=""

  while [[ "$attempts" -lt "$max_attempts" ]]; do
    snapshot="$(agent-browser --session "$SESSION" snapshot -d 8 || true)"
    if snapshot_is_space_canvas "$snapshot"; then
      ref="$(extract_chat_ref_from_text "$snapshot")"
    else
      ref=""
    fi
    if [[ -n "$ref" ]] && snapshot_is_space_canvas "$snapshot"; then
      printf '%s' "$ref"
      return 0
    fi

    if printf '%s\n' "$snapshot" | rg -q 'heading "Spaces"'; then
      agent-browser --session "$SESSION" find text "Scratch" click >/dev/null 2>&1 || true
    fi

    sleep 2
    attempts=$((attempts + 1))
  done

  return 1
}

wait_for_completion() {
  local timeout_ms="$1"
  local elapsed=0
  local snapshot=""
  local settle_snapshot=""
  local settle_round=0

  while [[ "$elapsed" -lt "$timeout_ms" ]]; do
    snapshot="$(agent-browser --session "$SESSION" snapshot -d 10 || true)"
    if ! printf '%s\n' "$snapshot" | rg -q "Thinking\\.\\.\\."; then
      while [[ "$settle_round" -lt 3 ]]; do
        sleep 1
        settle_snapshot="$(agent-browser --session "$SESSION" snapshot -d 10 || true)"
        if [[ -n "$settle_snapshot" ]] && ! printf '%s\n' "$settle_snapshot" | rg -q "Thinking\\.\\.\\."; then
          snapshot="$settle_snapshot"
        fi
        settle_round=$((settle_round + 1))
      done
      printf '%s' "$snapshot"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2000))
  done

  printf '%s' "$snapshot"
  return 1
}

telemetry_has_tool_event() {
  local segment_file="$1"
  local tool="$2"
  local event="$3"
  rg -q "\"source\":\"tool\\.${tool}\".*\"event\":\"${event}\"" "$segment_file"
}

telemetry_has_tool_result_success() {
  local segment_file="$1"
  local tool="$2"
  rg -q "\"source\":\"tool\\.${tool}\".*\"event\":\"result\".*\"success\":true" "$segment_file"
}

telemetry_has_tool_result_failure() {
  local segment_file="$1"
  local tool="$2"
  rg -q "\"source\":\"tool\\.${tool}\".*\"event\":\"result\".*\"success\":false" "$segment_file"
}

telemetry_has_any_success_result() {
  local segment_file="$1"
  rg -q "\"source\":\"tool\\.[^\"]+\".*\"event\":\"result\".*\"success\":true" "$segment_file"
}

snapshot_contains_ci() {
  local snapshot="$1"
  local phrase="$2"
  printf '%s\n' "$snapshot" | rg -q -i --fixed-strings "$phrase"
}

evaluate_ui_hint() {
  local snapshot="$1"
  local hint="$2"
  case "$hint" in
    "One activity component is visible.")
      snapshot_is_space_canvas "$snapshot" && (snapshot_contains_ci "$snapshot" "Activity Timeline" || snapshot_contains_ci "$snapshot" "Pete's Activity" || snapshot_contains_ci "$snapshot" "GitHub Activity")
      ;;
    "No new component is added.")
      snapshot_contains_ci "$snapshot" "Canvas is empty"
      ;;
    "A Slack mentions component is visible.")
      snapshot_contains_ci "$snapshot" "Mentions"
      ;;
    "Slack channel picker is shown (option list).")
      snapshot_contains_ci "$snapshot" "listbox \"Options\"" && snapshot_contains_ci "$snapshot" "Confirm"
      ;;
    "A Vercel deployments component is visible.")
      snapshot_contains_ci "$snapshot" "Deployments"
      ;;
    "A GitHub my-activity component is visible.")
      snapshot_contains_ci "$snapshot" "My Activity"
      ;;
    "A PostHog site health component is visible.")
      snapshot_contains_ci "$snapshot" "Site Health"
      ;;
    "No replacement tile is created solely for this preference change.")
      ! snapshot_contains_ci "$snapshot" "Add filtered"
      ;;
    "Multiple components are added as a coherent layout.")
      local matched_count=0
      local label
      for label in "Pr List" "Issue Grid" "Deployments" "Site Health" "Mentions" "Activity Timeline" "Project Status"; do
        if snapshot_contains_ci "$snapshot" "$label"; then
          matched_count=$((matched_count + 1))
        fi
      done
      [[ "$matched_count" -ge 2 ]]
      ;;
    "Active space title becomes Weekly Review.")
      snapshot_contains_ci "$snapshot" "Weekly Review"
      ;;
    "Assistant reports component was not found, without claiming success.")
      snapshot_contains_ci "$snapshot" "not found" || snapshot_contains_ci "$snapshot" "no component with the id" || snapshot_contains_ci "$snapshot" "does not exist" || snapshot_contains_ci "$snapshot" "doesn't exist" || snapshot_contains_ci "$snapshot" "might not be present" || snapshot_contains_ci "$snapshot" "Remove component cmp_"
      ;;
    *)
      return 2
      ;;
  esac
}

run_case() {
  local case_id="$1"
  local case_json prompt outcome start_line snapshot segment_file
  local status="PASS"
  local setup_prompts=()
  local tools_any=()
  local tools_none=()
  local must_not_say=()
  local must_say_any=()
  local ui_hints=()
  local failed_checks=()
  local unknown_ui_checks=()
  local passed_checks=()

  case_json="$(jq -c --arg id "$case_id" '.cases[] | select(.id == $id)' "$EVAL_FILE")"
  prompt="$(jq -r '.prompt' <<<"$case_json")"
  outcome="$(jq -r '.expected.outcome' <<<"$case_json")"
  while IFS= read -r v; do
    [[ -n "$v" ]] && setup_prompts+=("$v")
  done < <(jq -r '.setup_prompts[]?' <<<"$case_json")

  navigate_to_eval_space

  local setup_prompt
  for setup_prompt in "${setup_prompts[@]-}"; do
    local setup_chat_ref
    setup_chat_ref="$(wait_for_chat_ref || true)"
    if [[ -z "$setup_chat_ref" ]]; then
      continue
    fi
    agent-browser --session "$SESSION" fill "@$setup_chat_ref" "$setup_prompt" >/dev/null
    agent-browser --session "$SESSION" press Enter >/dev/null
    wait_for_completion "$WAIT_MS" >/dev/null || true
  done

  local chat_ref
  chat_ref="$(wait_for_chat_ref || true)"
  if [[ -z "$chat_ref" ]]; then
    failed_checks+=("chat_input_ref_available")
    snapshot="$(agent-browser --session "$SESSION" snapshot -d 10 || true)"
  else
    start_line="$(wc -l < "$LOG_PATH")"
    agent-browser --session "$SESSION" fill "@$chat_ref" "$prompt" >/dev/null
    agent-browser --session "$SESSION" press Enter >/dev/null
    snapshot="$(wait_for_completion "$WAIT_MS" || true)"
    segment_file="$TMP_DIR/$case_id.telemetry.log"
    tail -n +"$((start_line + 1))" "$LOG_PATH" > "$segment_file"

    while IFS= read -r v; do
      [[ -n "$v" ]] && tools_any+=("$v")
    done < <(jq -r '.expected.tool_calls_any[]?' <<<"$case_json")

    while IFS= read -r v; do
      [[ -n "$v" ]] && tools_none+=("$v")
    done < <(jq -r '.expected.tool_calls_none[]?' <<<"$case_json")

    while IFS= read -r v; do
      [[ -n "$v" ]] && must_not_say+=("$v")
    done < <(jq -r '.expected.must_not_say[]?' <<<"$case_json")

    while IFS= read -r v; do
      [[ -n "$v" ]] && must_say_any+=("$v")
    done < <(jq -r '.expected.must_say_any[]?' <<<"$case_json")

    while IFS= read -r v; do
      [[ -n "$v" ]] && ui_hints+=("$v")
    done < <(jq -r '.expected.ui[]?' <<<"$case_json")

    local found_any_tool_start=0
    local tools_any_count=0
    local tool
    for tool in "${tools_any[@]-}"; do
      [[ -z "$tool" ]] && continue
      tools_any_count=$((tools_any_count + 1))
      if telemetry_has_tool_event "$segment_file" "$tool" "start"; then
        found_any_tool_start=1
      fi
    done
    if [[ "$tools_any_count" -gt 0 ]]; then
      if [[ "$found_any_tool_start" -eq 1 ]]; then
        passed_checks+=("tool_calls_any")
      else
        failed_checks+=("tool_calls_any")
      fi
    fi

    for tool in "${tools_none[@]-}"; do
      [[ -z "$tool" ]] && continue
      if telemetry_has_tool_event "$segment_file" "$tool" "start"; then
        failed_checks+=("tool_calls_none:$tool")
      else
        passed_checks+=("tool_calls_none:$tool")
      fi
    done

    local phrase
    for phrase in "${must_not_say[@]-}"; do
      [[ -z "$phrase" ]] && continue
      if snapshot_contains_ci "$snapshot" "$phrase"; then
        failed_checks+=("must_not_say:$phrase")
      else
        passed_checks+=("must_not_say:$phrase")
      fi
    done

    local must_say_any_count=0
    local any_phrase_found=0
    for phrase in "${must_say_any[@]-}"; do
      [[ -z "$phrase" ]] && continue
      must_say_any_count=$((must_say_any_count + 1))
      if snapshot_contains_ci "$snapshot" "$phrase"; then
        any_phrase_found=1
      fi
    done
    if [[ "$must_say_any_count" -gt 0 ]]; then
      if [[ "$any_phrase_found" -eq 1 ]]; then
        passed_checks+=("must_say_any")
      else
        failed_checks+=("must_say_any")
      fi
    fi

    case "$outcome" in
      tool_success)
        local has_success=0
        if [[ "$tools_any_count" -gt 0 ]]; then
          for tool in "${tools_any[@]-}"; do
            [[ -z "$tool" ]] && continue
            if telemetry_has_tool_result_success "$segment_file" "$tool"; then
              has_success=1
            fi
          done
        else
          if telemetry_has_any_success_result "$segment_file"; then
            has_success=1
          fi
        fi
        if [[ "$has_success" -eq 1 ]]; then
          passed_checks+=("outcome:tool_success")
        else
          failed_checks+=("outcome:tool_success")
        fi
        ;;
      graceful_block)
        if telemetry_has_any_success_result "$segment_file"; then
          failed_checks+=("outcome:graceful_block")
        else
          passed_checks+=("outcome:graceful_block")
        fi
        ;;
      needs_input)
        local has_success=0
        for tool in "${tools_any[@]-}"; do
          [[ -z "$tool" ]] && continue
          if telemetry_has_tool_result_success "$segment_file" "$tool"; then
            has_success=1
          fi
        done
        if [[ "$has_success" -eq 1 ]]; then
          failed_checks+=("outcome:needs_input")
        else
          passed_checks+=("outcome:needs_input")
        fi
        ;;
      graceful_error)
        local has_failure=0
        for tool in "${tools_any[@]-}"; do
          [[ -z "$tool" ]] && continue
          if telemetry_has_tool_result_failure "$segment_file" "$tool"; then
            has_failure=1
          fi
        done
        if [[ "$has_failure" -eq 1 ]]; then
          passed_checks+=("outcome:graceful_error")
        else
          failed_checks+=("outcome:graceful_error")
        fi
        ;;
      tool_started)
        if [[ "$found_any_tool_start" -eq 1 ]]; then
          passed_checks+=("outcome:tool_started")
        else
          failed_checks+=("outcome:tool_started")
        fi
        ;;
    esac

    local ui
    for ui in "${ui_hints[@]-}"; do
      [[ -z "$ui" ]] && continue
      if evaluate_ui_hint "$snapshot" "$ui"; then
        passed_checks+=("ui:$ui")
      else
        local ui_status=$?
        if [[ "$ui_status" -eq 2 ]]; then
          unknown_ui_checks+=("$ui")
        else
          failed_checks+=("ui:$ui")
        fi
      fi
    done
  fi

  if [[ "${#failed_checks[@]}" -gt 0 ]]; then
    status="FAIL"
  elif [[ "${#unknown_ui_checks[@]}" -gt 0 ]]; then
    status="PARTIAL"
  fi

  local fail_json unknown_json pass_json
  fail_json="$(printf '%s\n' "${failed_checks[@]:-}" | jq -R . | jq -s 'map(select(length>0))')"
  unknown_json="$(printf '%s\n' "${unknown_ui_checks[@]:-}" | jq -R . | jq -s 'map(select(length>0))')"
  pass_json="$(printf '%s\n' "${passed_checks[@]:-}" | jq -R . | jq -s 'map(select(length>0))')"

  jq -n \
    --arg id "$case_id" \
    --arg prompt "$prompt" \
    --arg outcome "$outcome" \
    --arg status "$status" \
    --arg snapshot "$snapshot" \
    --argjson failed "$fail_json" \
    --argjson unknown "$unknown_json" \
    --argjson passed "$pass_json" \
    '{
      id: $id,
      prompt: $prompt,
      expected_outcome: $outcome,
      status: $status,
      checks: {
        passed: $passed,
        failed: $failed,
        unknown_ui: $unknown
      },
      snapshot_excerpt: ($snapshot | split("\n")[:40])
    }'
}

echo "Running minimum eval set with session: $SESSION"
echo "Eval file: $EVAL_FILE"
echo "Telemetry log: $LOG_PATH"

case_results_json="[]"

for case_id in "${CASE_IDS[@]}"; do
  echo "→ Case $case_id"
  case_result="$(run_case "$case_id")"
  case_status="$(jq -r '.status' <<<"$case_result")"
  echo "  $case_status"
  case_results_json="$(jq -c --argjson current "$case_results_json" --argjson item "$case_result" '$current + [$item]' <<< '{}')"
done

summary_json="$(jq -n --argjson cases "$case_results_json" '
  {
    pass: ($cases | map(select(.status=="PASS")) | length),
    fail: ($cases | map(select(.status=="FAIL")) | length),
    partial: ($cases | map(select(.status=="PARTIAL")) | length),
    total: ($cases | length)
  }'
)"

jq -n \
  --arg generated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg eval_file "$EVAL_FILE" \
  --arg app_url "$APP_URL" \
  --arg space_url "$SPACE_URL" \
  --arg session "$SESSION" \
  --arg log_path "$LOG_PATH" \
  --argjson summary "$summary_json" \
  --argjson cases "$case_results_json" \
  '{
    generated_at: $generated_at,
    eval_file: $eval_file,
    app_url: $app_url,
    space_url: (if $space_url == "" then null else $space_url end),
    session: $session,
    telemetry_log_path: $log_path,
    summary: $summary,
    cases: $cases
  }' > "$RESULT_JSON"

{
  echo "# Minimum Eval Results"
  echo
  echo "- Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "- Eval file: \`$EVAL_FILE\`"
  echo "- App URL: \`$APP_URL\`"
  if [[ -n "$SPACE_URL" ]]; then
    echo "- Space URL: \`$SPACE_URL\`"
  fi
  echo "- Session: \`$SESSION\`"
  echo "- Telemetry log: \`$LOG_PATH\`"
  echo
  echo "## Summary"
  echo
  echo "- Pass: $(jq -r '.pass' <<<"$summary_json")"
  echo "- Fail: $(jq -r '.fail' <<<"$summary_json")"
  echo "- Partial: $(jq -r '.partial' <<<"$summary_json")"
  echo "- Total: $(jq -r '.total' <<<"$summary_json")"
  echo
  echo "## Cases"
  echo
  echo "| Case | Status | Failed Checks | Unknown UI Checks |"
  echo "|---|---|---|---|"
  jq -r '
    .cases[] |
    [ .id, .status, (.checks.failed | join("; ")), (.checks.unknown_ui | join("; ")) ] |
    "| " + join(" | ") + " |"
  ' "$RESULT_JSON"
} > "$RESULT_MD"

echo "Wrote:"
echo "  $RESULT_JSON"
echo "  $RESULT_MD"
