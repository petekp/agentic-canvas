#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
run-min-evals.sh - Execute assistant eval sets via agent-browser + telemetry + synthesis checks.

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
  --self-test            Run runner self-tests and exit
  -h, --help             Show help
USAGE
}

EVAL_FILE=".claude/evals/minimum-eval-set.v0.1.json"
APP_URL="http://localhost:3003"
SPACE_URL=""
CASES_ARG=""
WAIT_MS=20000
LIST_ONLY=0
SELF_TEST=0
SESSION="min-eval-$(date +%s)"
LOG_PATH="${TELEMETRY_LOG_PATH:-.claude/telemetry/agentic-canvas.log}"

RESULTS_DIR=".claude/evals/results"
TIMESTAMP=""
RESULT_JSON=""
RESULT_MD=""
TMP_DIR=""

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

snapshot_contains_ci() {
  local snapshot="$1"
  local phrase="$2"
  printf '%s\n' "$snapshot" | rg -q -i --fixed-strings "$phrase"
}

snapshot_contains_regex_ci() {
  local snapshot="$1"
  local pattern="$2"
  printf '%s\n' "$snapshot" | rg -q -i --pcre2 "$pattern" 2>/dev/null
}

snapshot_flatten() {
  local snapshot="$1"
  printf '%s' "$snapshot" | tr '\n' ' '
}

escape_regex() {
  local input="$1"
  printf '%s' "$input" | sed -e 's/[.[\*^$()+?{|\\]/\\&/g'
}

to_json_array_from_stdin() {
  jq -R . | jq -s 'map(select(length>0))'
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

telemetry_has_any_start_event() {
  local segment_file="$1"
  rg -q "\"source\":\"tool\\.[^\"]+\".*\"event\":\"start\"" "$segment_file"
}

telemetry_expectation_matches() {
  local segment_file="$1"
  local expectation="$2"

  if [[ "$expectation" =~ ^tool\.([a-zA-Z0-9_]+)[[:space:]]+start$ ]]; then
    telemetry_has_tool_event "$segment_file" "${BASH_REMATCH[1]}" "start"
    return
  fi

  if [[ "$expectation" =~ ^tool\.([a-zA-Z0-9_]+)[[:space:]]+result[[:space:]]+success:true$ ]]; then
    telemetry_has_tool_result_success "$segment_file" "${BASH_REMATCH[1]}"
    return
  fi

  if [[ "$expectation" =~ ^tool\.([a-zA-Z0-9_]+)[[:space:]]+result[[:space:]]+success:false$ ]]; then
    telemetry_has_tool_result_failure "$segment_file" "${BASH_REMATCH[1]}"
    return
  fi

  if [[ "$expectation" =~ ^success:false[[:space:]]+with[[:space:]]+missingFields[[:space:]]+containing[[:space:]]+([a-zA-Z0-9_]+)$ ]]; then
    local missing_field="${BASH_REMATCH[1]}"
    rg -q "\"event\":\"result\".*\"success\":false" "$segment_file" && rg -q -i "missingFields|missing_fields" "$segment_file" && rg -q --fixed-strings "$missing_field" "$segment_file"
    return
  fi

  rg -q -i --fixed-strings "$expectation" "$segment_file"
}

default_source_patterns_json() {
  local source="$1"
  local source_lc
  source_lc="$(printf '%s' "$source" | tr '[:upper:]' '[:lower:]')"

  case "$source_lc" in
    github)
      printf '%s' '["github", "commit", "pull request", "pr", "issue", "repo"]'
      ;;
    slack)
      printf '%s' '["slack", "mention", "channel", "message", "thread"]'
      ;;
    posthog)
      printf '%s' '["posthog", "site health", "event", "funnel", "insight"]'
      ;;
    vercel)
      printf '%s' '["vercel", "deployment", "build", "production"]'
      ;;
    *)
      jq -cn --arg s "$source" '[$s]'
      ;;
  esac
}

score_required_sources() {
  local case_json="$1"
  local snapshot="$2"
  local required_sources=()
  local passed_checks=()
  local failed_checks=()
  local missing=()
  local total=0
  local passed=0

  while IFS= read -r src; do
    [[ -n "$src" ]] && required_sources+=("$src")
  done < <(jq -r '.expected.required_sources[]?' <<<"$case_json")

  local source
  for source in "${required_sources[@]:-}"; do
    [[ -z "$source" ]] && continue
    total=$((total + 1))
    local pattern_json
    pattern_json="$(jq -c --arg s "$source" '.expected.source_patterns[$s] // empty' <<<"$case_json")"
    if [[ -z "$pattern_json" || "$pattern_json" == "null" ]]; then
      pattern_json="$(default_source_patterns_json "$source")"
    fi

    local covered=0
    local pattern
    while IFS= read -r pattern; do
      [[ -z "$pattern" ]] && continue
      if snapshot_contains_ci "$snapshot" "$pattern"; then
        covered=1
        break
      fi
    done < <(jq -r '.[]?' <<<"$pattern_json")

    if [[ "$covered" -eq 1 ]]; then
      passed=$((passed + 1))
      passed_checks+=("synthesis:required_source:$source")
    else
      missing+=("$source")
      failed_checks+=("synthesis:required_source:$source")
    fi
  done

  local missing_json passed_json failed_json
  missing_json="$(printf '%s\n' "${missing[@]:-}" | to_json_array_from_stdin)"
  passed_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"
  failed_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"

  jq -n \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson missing "$missing_json" \
    --argjson passed_checks "$passed_json" \
    --argjson failed_checks "$failed_json" \
    '{
      total: $total,
      passed: $passed,
      missing: $missing,
      passed_checks: $passed_checks,
      failed_checks: $failed_checks
    }'
}

score_numeric_grounding() {
  local case_json="$1"
  local snapshot="$2"
  local flat_snapshot
  flat_snapshot="$(snapshot_flatten "$snapshot")"

  local passed_checks=()
  local failed_checks=()
  local missing=()
  local total=0
  local passed=0

  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    total=$((total + 1))

    local label
    label="$(jq -r 'if type == "object" then (.label // .value // .regex // "numeric") else tostring end' <<<"$item")"
    local matched=0

    if jq -e 'type == "object" and has("regex")' >/dev/null <<<"$item"; then
      local regex
      regex="$(jq -r '.regex' <<<"$item")"
      if snapshot_contains_regex_ci "$snapshot" "$regex"; then
        matched=1
      fi
    else
      local value
      value="$(jq -r 'if type == "object" then (.value // "") else tostring end' <<<"$item")"
      if [[ -n "$value" ]]; then
        if jq -e 'type == "object" and (.context_any | type == "array") and (.context_any | length > 0)' >/dev/null <<<"$item"; then
          local has_context=0
          local ctx
          while IFS= read -r ctx; do
            [[ -z "$ctx" ]] && continue
            if snapshot_contains_ci "$snapshot" "$ctx"; then
              has_context=1
              break
            fi
          done < <(jq -r '.context_any[]?' <<<"$item")

          if [[ "$has_context" -eq 1 ]] && printf '%s\n' "$flat_snapshot" | rg -q --fixed-strings "$value"; then
            matched=1
          fi
        else
          if printf '%s\n' "$flat_snapshot" | rg -q --fixed-strings "$value"; then
            matched=1
          fi
        fi
      fi
    fi

    if [[ "$matched" -eq 1 ]]; then
      passed=$((passed + 1))
      passed_checks+=("synthesis:numeric:$label")
    else
      missing+=("$label")
      failed_checks+=("synthesis:numeric:$label")
    fi
  done < <(jq -c '.expected.must_ground_numbers[]?' <<<"$case_json")

  local missing_json passed_json failed_json
  missing_json="$(printf '%s\n' "${missing[@]:-}" | to_json_array_from_stdin)"
  passed_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"
  failed_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"

  jq -n \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson missing "$missing_json" \
    --argjson passed_checks "$passed_json" \
    --argjson failed_checks "$failed_json" \
    '{
      total: $total,
      passed: $passed,
      missing: $missing,
      passed_checks: $passed_checks,
      failed_checks: $failed_checks
    }'
}

score_assumption_labeling() {
  local case_json="$1"
  local snapshot="$2"
  local required
  required="$(jq -r '.expected.must_label_assumptions // false' <<<"$case_json")"

  if [[ "$required" != "true" ]]; then
    jq -n '{ required: false, total: 0, passed: 0, passed_checks: [], failed_checks: [] }'
    return
  fi

  local markers=()
  while IFS= read -r marker; do
    [[ -n "$marker" ]] && markers+=("$marker")
  done < <(jq -r '.expected.assumption_markers_any[]? // empty' <<<"$case_json")

  if [[ "${#markers[@]}" -eq 0 ]]; then
    markers=(
      "assumption"
      "assuming"
      "uncertain"
      "not enough data"
      "insufficient data"
      "based on available data"
      "cannot verify"
      "may be stale"
      "might be stale"
      "confidence"
    )
  fi

  local matched=0
  local marker
  for marker in "${markers[@]}"; do
    if snapshot_contains_ci "$snapshot" "$marker"; then
      matched=1
      break
    fi
  done

  if [[ "$matched" -eq 1 ]]; then
    jq -n '{ required: true, total: 1, passed: 1, passed_checks: ["synthesis:assumptions"], failed_checks: [] }'
  else
    jq -n '{ required: true, total: 1, passed: 0, passed_checks: [], failed_checks: ["synthesis:assumptions"] }'
  fi
}

score_regex_constraints() {
  local case_json="$1"
  local snapshot="$2"
  local passed_checks=()
  local failed_checks=()
  local total=0
  local passed=0

  local pattern
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    total=$((total + 1))
    if snapshot_contains_regex_ci "$snapshot" "$pattern"; then
      passed=$((passed + 1))
      passed_checks+=("format:must_match_regex:$pattern")
    else
      failed_checks+=("format:must_match_regex:$pattern")
    fi
  done < <(jq -r '.expected.must_match_regex[]?' <<<"$case_json")

  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    total=$((total + 1))
    if snapshot_contains_regex_ci "$snapshot" "$pattern"; then
      failed_checks+=("format:must_not_match_regex:$pattern")
    else
      passed=$((passed + 1))
      passed_checks+=("format:must_not_match_regex:$pattern")
    fi
  done < <(jq -r '.expected.must_not_match_regex[]?' <<<"$case_json")

  local passed_json failed_json
  passed_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"
  failed_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"

  jq -n \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson passed_checks "$passed_json" \
    --argjson failed_checks "$failed_json" \
    '{
      total: $total,
      passed: $passed,
      passed_checks: $passed_checks,
      failed_checks: $failed_checks
    }'
}

score_morning_brief_contract() {
  local case_json="$1"
  local snapshot="$2"

  local required_levers
  required_levers="$(jq -r '.expected.required_levers // empty' <<<"$case_json")"
  local claim_alignment
  claim_alignment="$(jq -r '.expected.claim_evidence_alignment // false' <<<"$case_json")"
  local freshness_max
  freshness_max="$(jq -r '.expected.evidence_freshness_max_age_minutes // empty' <<<"$case_json")"

  local override_actions=()
  while IFS= read -r action; do
    [[ -n "$action" ]] && override_actions+=("$action")
  done < <(jq -r '.expected.must_allow_override_actions[]?' <<<"$case_json")

  if [[ -z "$required_levers" && "$claim_alignment" != "true" && -z "$freshness_max" && "${#override_actions[@]}" -eq 0 ]]; then
    jq -n '{ total: 0, passed: 0, missing: [], passed_checks: [], failed_checks: [] }'
    return
  fi

  local passed_checks=()
  local failed_checks=()
  local missing=()
  local total=0
  local passed=0

  if [[ -n "$required_levers" ]]; then
    total=$((total + 1))
    local lever_regex lever_count
    lever_regex="$(jq -r '.expected.lever_regex // "(?im)^(?:[-*]|[0-9]+\\.)\\s+.+"' <<<"$case_json")"
    lever_count="$(printf '%s\n' "$snapshot" | rg -o --pcre2 "$lever_regex" | wc -l | tr -d ' ')"
    if [[ -z "$lever_count" ]]; then
      lever_count=0
    fi
    if [[ "$lever_count" -ge "$required_levers" ]]; then
      passed=$((passed + 1))
      passed_checks+=("morning_brief:required_levers")
    else
      missing+=("required_levers")
      failed_checks+=("morning_brief:required_levers")
    fi
  fi

  if [[ "$claim_alignment" == "true" ]]; then
    total=$((total + 1))
    local claim_regex evidence_regex linkage_regex
    claim_regex="$(jq -r '.expected.claim_marker_regex // "(?i)(today.?s mission|mission|recommendation)"' <<<"$case_json")"
    evidence_regex="$(jq -r '.expected.evidence_marker_regex // "(?i)(evidence|source|observed|metric)"' <<<"$case_json")"
    linkage_regex="$(jq -r '.expected.alignment_marker_regex // "(?i)(because|based on|backed by|driven by|grounded in)"' <<<"$case_json")"

    if snapshot_contains_regex_ci "$snapshot" "$claim_regex" && \
      snapshot_contains_regex_ci "$snapshot" "$evidence_regex" && \
      snapshot_contains_regex_ci "$snapshot" "$linkage_regex"; then
      passed=$((passed + 1))
      passed_checks+=("morning_brief:claim_evidence_alignment")
    else
      missing+=("claim_evidence_alignment")
      failed_checks+=("morning_brief:claim_evidence_alignment")
    fi
  fi

  if [[ -n "$freshness_max" ]]; then
    total=$((total + 1))
    local freshness_regex freshness_values max_age
    freshness_regex="$(jq -r '.expected.evidence_freshness_regex // "(?i)[0-9]{1,4}\\s*(?:m|min|minute|minutes)"' <<<"$case_json")"
    freshness_values="$(printf '%s\n' "$snapshot" | rg -o --pcre2 "$freshness_regex" | rg -o '[0-9]{1,4}' || true)"
    max_age="$(printf '%s\n' "$freshness_values" | sort -nr | head -n 1 | tr -d ' ')"

    if [[ -n "$max_age" ]] && [[ "$max_age" -le "$freshness_max" ]]; then
      passed=$((passed + 1))
      passed_checks+=("morning_brief:evidence_freshness")
    else
      missing+=("evidence_freshness_max_age_minutes")
      failed_checks+=("morning_brief:evidence_freshness")
    fi
  fi

  local action
  for action in "${override_actions[@]:-}"; do
    [[ -z "$action" ]] && continue
    total=$((total + 1))
    if snapshot_contains_ci "$snapshot" "$action"; then
      passed=$((passed + 1))
      passed_checks+=("morning_brief:override_action:$action")
    else
      missing+=("override_action:$action")
      failed_checks+=("morning_brief:override_action:$action")
    fi
  done

  local missing_json passed_json failed_json
  missing_json="$(printf '%s\n' "${missing[@]:-}" | to_json_array_from_stdin)"
  passed_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"
  failed_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"

  jq -n \
    --argjson total "$total" \
    --argjson passed "$passed" \
    --argjson missing "$missing_json" \
    --argjson passed_checks "$passed_json" \
    --argjson failed_checks "$failed_json" \
    '{
      total: $total,
      passed: $passed,
      missing: $missing,
      passed_checks: $passed_checks,
      failed_checks: $failed_checks
    }'
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

extract_chat_ref_from_text() {
  local text="$1"
  printf '%s\n' "$text" | sed -n 's/.*textbox "Ask about your canvas\.\.\." \[ref=\(e[0-9][0-9]*\)\].*/\1/p' | head -n 1
}

snapshot_is_space_canvas() {
  local snapshot="$1"
  printf '%s\n' "$snapshot" | rg -q 'button "Back to Spaces"|button "Add Component"|paragraph: Canvas is empty'
}

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
    if ! printf '%s\n' "$snapshot" | rg -q "Thinking\.\.\."; then
      while [[ "$settle_round" -lt 3 ]]; do
        sleep 1
        settle_snapshot="$(agent-browser --session "$SESSION" snapshot -d 10 || true)"
        if [[ -n "$settle_snapshot" ]] && ! printf '%s\n' "$settle_snapshot" | rg -q "Thinking\.\.\."; then
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

float_expr() {
  local expression="$1"
  awk "BEGIN { printf \"%.6f\", ($expression) }"
}

group_score() {
  local passed="$1"
  local total="$2"
  if [[ "$total" -eq 0 ]]; then
    printf '1.000000'
  else
    float_expr "$passed / $total"
  fi
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
  local telemetry_expectations=()
  local failed_checks=()
  local unknown_ui_checks=()
  local passed_checks=()

  local tool_group_total=0
  local tool_group_passed=0
  local synthesis_group_total=0
  local synthesis_group_passed=0
  local numeric_group_total=0
  local numeric_group_passed=0
  local uncertainty_group_total=0
  local uncertainty_group_passed=0
  local formatting_group_total=0
  local formatting_group_passed=0
  local morning_brief_group_total=0
  local morning_brief_group_passed=0

  case_json="$(jq -c --arg id "$case_id" '.cases[] | select(.id == $id)' "$EVAL_FILE")"
  prompt="$(jq -r '.prompt' <<<"$case_json")"
  outcome="$(jq -r '.expected.outcome // "response_only"' <<<"$case_json")"
  while IFS= read -r v; do
    [[ -n "$v" ]] && setup_prompts+=("$v")
  done < <(jq -r '.setup_prompts[]?' <<<"$case_json")

  navigate_to_eval_space

  local setup_prompt
  for setup_prompt in "${setup_prompts[@]:-}"; do
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

    while IFS= read -r v; do
      [[ -n "$v" ]] && telemetry_expectations+=("$v")
    done < <(jq -r '.expected.telemetry[]?' <<<"$case_json")

    local found_any_tool_start=0
    local tools_any_count=0
    local tool
    for tool in "${tools_any[@]:-}"; do
      [[ -z "$tool" ]] && continue
      tools_any_count=$((tools_any_count + 1))
      if telemetry_has_tool_event "$segment_file" "$tool" "start"; then
        found_any_tool_start=1
      fi
    done

    if [[ "$tools_any_count" -gt 0 ]]; then
      tool_group_total=$((tool_group_total + 1))
      if [[ "$found_any_tool_start" -eq 1 ]]; then
        passed_checks+=("tool_calls_any")
        tool_group_passed=$((tool_group_passed + 1))
      else
        failed_checks+=("tool_calls_any")
      fi
    fi

    for tool in "${tools_none[@]:-}"; do
      [[ -z "$tool" ]] && continue
      tool_group_total=$((tool_group_total + 1))
      if telemetry_has_tool_event "$segment_file" "$tool" "start"; then
        failed_checks+=("tool_calls_none:$tool")
      else
        passed_checks+=("tool_calls_none:$tool")
        tool_group_passed=$((tool_group_passed + 1))
      fi
    done

    local phrase
    for phrase in "${must_not_say[@]:-}"; do
      [[ -z "$phrase" ]] && continue
      formatting_group_total=$((formatting_group_total + 1))
      if snapshot_contains_ci "$snapshot" "$phrase"; then
        failed_checks+=("must_not_say:$phrase")
      else
        passed_checks+=("must_not_say:$phrase")
        formatting_group_passed=$((formatting_group_passed + 1))
      fi
    done

    local must_say_any_count=0
    local any_phrase_found=0
    for phrase in "${must_say_any[@]:-}"; do
      [[ -z "$phrase" ]] && continue
      must_say_any_count=$((must_say_any_count + 1))
      if snapshot_contains_ci "$snapshot" "$phrase"; then
        any_phrase_found=1
      fi
    done
    if [[ "$must_say_any_count" -gt 0 ]]; then
      formatting_group_total=$((formatting_group_total + 1))
      if [[ "$any_phrase_found" -eq 1 ]]; then
        passed_checks+=("must_say_any")
        formatting_group_passed=$((formatting_group_passed + 1))
      else
        failed_checks+=("must_say_any")
      fi
    fi

    local telemetry_expectation
    for telemetry_expectation in "${telemetry_expectations[@]:-}"; do
      [[ -z "$telemetry_expectation" ]] && continue
      tool_group_total=$((tool_group_total + 1))
      if telemetry_expectation_matches "$segment_file" "$telemetry_expectation"; then
        passed_checks+=("telemetry:$telemetry_expectation")
        tool_group_passed=$((tool_group_passed + 1))
      else
        failed_checks+=("telemetry:$telemetry_expectation")
      fi
    done

    case "$outcome" in
      tool_success)
        tool_group_total=$((tool_group_total + 1))
        local has_success=0
        if [[ "$tools_any_count" -gt 0 ]]; then
          for tool in "${tools_any[@]:-}"; do
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
          tool_group_passed=$((tool_group_passed + 1))
        else
          failed_checks+=("outcome:tool_success")
        fi
        ;;
      graceful_block)
        tool_group_total=$((tool_group_total + 1))
        if telemetry_has_any_success_result "$segment_file"; then
          failed_checks+=("outcome:graceful_block")
        else
          passed_checks+=("outcome:graceful_block")
          tool_group_passed=$((tool_group_passed + 1))
        fi
        ;;
      needs_input)
        tool_group_total=$((tool_group_total + 1))
        local has_success=0
        for tool in "${tools_any[@]:-}"; do
          [[ -z "$tool" ]] && continue
          if telemetry_has_tool_result_success "$segment_file" "$tool"; then
            has_success=1
          fi
        done
        if [[ "$has_success" -eq 1 ]]; then
          failed_checks+=("outcome:needs_input")
        else
          passed_checks+=("outcome:needs_input")
          tool_group_passed=$((tool_group_passed + 1))
        fi
        ;;
      graceful_error)
        tool_group_total=$((tool_group_total + 1))
        local has_failure=0
        for tool in "${tools_any[@]:-}"; do
          [[ -z "$tool" ]] && continue
          if telemetry_has_tool_result_failure "$segment_file" "$tool"; then
            has_failure=1
          fi
        done
        if [[ "$has_failure" -eq 1 ]]; then
          passed_checks+=("outcome:graceful_error")
          tool_group_passed=$((tool_group_passed + 1))
        else
          failed_checks+=("outcome:graceful_error")
        fi
        ;;
      tool_started)
        tool_group_total=$((tool_group_total + 1))
        local started_any=0
        if [[ "$found_any_tool_start" -eq 1 ]]; then
          started_any=1
        elif telemetry_has_any_start_event "$segment_file"; then
          started_any=1
        fi
        if [[ "$started_any" -eq 1 ]]; then
          passed_checks+=("outcome:tool_started")
          tool_group_passed=$((tool_group_passed + 1))
        else
          failed_checks+=("outcome:tool_started")
        fi
        ;;
      response_only)
        tool_group_total=$((tool_group_total + 1))
        passed_checks+=("outcome:response_only")
        tool_group_passed=$((tool_group_passed + 1))
        ;;
      *)
        failed_checks+=("outcome:unknown:$outcome")
        ;;
    esac

    local ui
    for ui in "${ui_hints[@]:-}"; do
      [[ -z "$ui" ]] && continue
      tool_group_total=$((tool_group_total + 1))
      if evaluate_ui_hint "$snapshot" "$ui"; then
        passed_checks+=("ui:$ui")
        tool_group_passed=$((tool_group_passed + 1))
      else
        local ui_status=$?
        if [[ "$ui_status" -eq 2 ]]; then
          unknown_ui_checks+=("$ui")
        else
          failed_checks+=("ui:$ui")
        fi
      fi
    done

    local required_sources_score
    required_sources_score="$(score_required_sources "$case_json" "$snapshot")"
    local rs_total rs_passed
    rs_total="$(jq -r '.total' <<<"$required_sources_score")"
    rs_passed="$(jq -r '.passed' <<<"$required_sources_score")"
    synthesis_group_total=$((synthesis_group_total + rs_total))
    synthesis_group_passed=$((synthesis_group_passed + rs_passed))
    while IFS= read -r v; do
      [[ -n "$v" ]] && passed_checks+=("$v")
    done < <(jq -r '.passed_checks[]?' <<<"$required_sources_score")
    while IFS= read -r v; do
      [[ -n "$v" ]] && failed_checks+=("$v")
    done < <(jq -r '.failed_checks[]?' <<<"$required_sources_score")

    local numeric_score
    numeric_score="$(score_numeric_grounding "$case_json" "$snapshot")"
    local ng_total ng_passed
    ng_total="$(jq -r '.total' <<<"$numeric_score")"
    ng_passed="$(jq -r '.passed' <<<"$numeric_score")"
    numeric_group_total=$((numeric_group_total + ng_total))
    numeric_group_passed=$((numeric_group_passed + ng_passed))
    while IFS= read -r v; do
      [[ -n "$v" ]] && passed_checks+=("$v")
    done < <(jq -r '.passed_checks[]?' <<<"$numeric_score")
    while IFS= read -r v; do
      [[ -n "$v" ]] && failed_checks+=("$v")
    done < <(jq -r '.failed_checks[]?' <<<"$numeric_score")

    local assumption_score
    assumption_score="$(score_assumption_labeling "$case_json" "$snapshot")"
    local as_total as_passed
    as_total="$(jq -r '.total' <<<"$assumption_score")"
    as_passed="$(jq -r '.passed' <<<"$assumption_score")"
    uncertainty_group_total=$((uncertainty_group_total + as_total))
    uncertainty_group_passed=$((uncertainty_group_passed + as_passed))
    while IFS= read -r v; do
      [[ -n "$v" ]] && passed_checks+=("$v")
    done < <(jq -r '.passed_checks[]?' <<<"$assumption_score")
    while IFS= read -r v; do
      [[ -n "$v" ]] && failed_checks+=("$v")
    done < <(jq -r '.failed_checks[]?' <<<"$assumption_score")

    local regex_score
    regex_score="$(score_regex_constraints "$case_json" "$snapshot")"
    local rx_total rx_passed
    rx_total="$(jq -r '.total' <<<"$regex_score")"
    rx_passed="$(jq -r '.passed' <<<"$regex_score")"
    formatting_group_total=$((formatting_group_total + rx_total))
    formatting_group_passed=$((formatting_group_passed + rx_passed))
    while IFS= read -r v; do
      [[ -n "$v" ]] && passed_checks+=("$v")
    done < <(jq -r '.passed_checks[]?' <<<"$regex_score")
    while IFS= read -r v; do
      [[ -n "$v" ]] && failed_checks+=("$v")
    done < <(jq -r '.failed_checks[]?' <<<"$regex_score")

    local morning_brief_score
    morning_brief_score="$(score_morning_brief_contract "$case_json" "$snapshot")"
    local mb_total mb_passed
    mb_total="$(jq -r '.total' <<<"$morning_brief_score")"
    mb_passed="$(jq -r '.passed' <<<"$morning_brief_score")"
    morning_brief_group_total=$((morning_brief_group_total + mb_total))
    morning_brief_group_passed=$((morning_brief_group_passed + mb_passed))
    while IFS= read -r v; do
      [[ -n "$v" ]] && passed_checks+=("$v")
    done < <(jq -r '.passed_checks[]?' <<<"$morning_brief_score")
    while IFS= read -r v; do
      [[ -n "$v" ]] && failed_checks+=("$v")
    done < <(jq -r '.failed_checks[]?' <<<"$morning_brief_score")

    local scoring_cfg
    scoring_cfg="$(jq -c '.expected.scoring // {}' <<<"$case_json")"

    local tool_score synth_score numeric_score_val uncertainty_score_val formatting_score morning_brief_score_val
    tool_score="$(group_score "$tool_group_passed" "$tool_group_total")"
    synth_score="$(group_score "$synthesis_group_passed" "$synthesis_group_total")"
    numeric_score_val="$(group_score "$numeric_group_passed" "$numeric_group_total")"
    uncertainty_score_val="$(group_score "$uncertainty_group_passed" "$uncertainty_group_total")"
    formatting_score="$(group_score "$formatting_group_passed" "$formatting_group_total")"
    morning_brief_score_val="$(group_score "$morning_brief_group_passed" "$morning_brief_group_total")"

    local soft_threshold=""
    soft_threshold="$(jq -r '.soft_score.threshold // empty' <<<"$scoring_cfg")"
    local soft_weights
    soft_weights="$(jq -c '.soft_score.weights // empty' <<<"$scoring_cfg")"
    if [[ -z "$soft_weights" || "$soft_weights" == "null" ]]; then
      soft_weights='{"tool_hygiene":0.35,"synthesis_coverage":0.30,"numeric_grounding":0.20,"uncertainty":0.10,"formatting":0.05}'
    fi

    local weighted_sum="0.000000"
    local weight_total="0.000000"
    while IFS=$'\t' read -r group weight; do
      [[ -z "$group" || -z "$weight" ]] && continue
      local group_value="1.000000"
      case "$group" in
        tool_hygiene) group_value="$tool_score" ;;
        synthesis_coverage) group_value="$synth_score" ;;
        numeric_grounding) group_value="$numeric_score_val" ;;
        uncertainty) group_value="$uncertainty_score_val" ;;
        formatting) group_value="$formatting_score" ;;
        morning_brief_contract) group_value="$morning_brief_score_val" ;;
      esac
      weighted_sum="$(float_expr "$weighted_sum + ($weight * $group_value)")"
      weight_total="$(float_expr "$weight_total + $weight")"
    done < <(jq -r 'to_entries[] | "\(.key)\t\(.value)"' <<<"$soft_weights")

    local soft_score="1.000000"
    if ! awk -v t="$weight_total" 'BEGIN { exit (t > 0 ? 0 : 1) }'; then
      soft_score="1.000000"
    else
      soft_score="$(float_expr "$weighted_sum / $weight_total")"
    fi

    local soft_score_pass=1
    if [[ -n "$soft_threshold" ]]; then
      if awk -v score="$soft_score" -v threshold="$soft_threshold" 'BEGIN { exit (score + 0 >= threshold + 0 ? 0 : 1) }'; then
        soft_score_pass=1
      else
        soft_score_pass=0
      fi
    fi

    local hard_fail_groups=()
    while IFS= read -r g; do
      [[ -n "$g" ]] && hard_fail_groups+=("$g")
    done < <(jq -r '.hard_fail[]?' <<<"$scoring_cfg")

    local hard_fail_triggered=()
    local g
    for g in "${hard_fail_groups[@]:-}"; do
      local g_total=0
      local g_passed=0
      case "$g" in
        tool_hygiene)
          g_total="$tool_group_total"
          g_passed="$tool_group_passed"
          ;;
        synthesis_coverage)
          g_total="$synthesis_group_total"
          g_passed="$synthesis_group_passed"
          ;;
        numeric_grounding)
          g_total="$numeric_group_total"
          g_passed="$numeric_group_passed"
          ;;
        uncertainty)
          g_total="$uncertainty_group_total"
          g_passed="$uncertainty_group_passed"
          ;;
        formatting)
          g_total="$formatting_group_total"
          g_passed="$formatting_group_passed"
          ;;
        morning_brief_contract)
          g_total="$morning_brief_group_total"
          g_passed="$morning_brief_group_passed"
          ;;
      esac
      if [[ "$g_total" -gt 0 && "$g_passed" -lt "$g_total" ]]; then
        hard_fail_triggered+=("$g")
      fi
    done

    if [[ "${#failed_checks[@]}" -gt 0 ]]; then
      status="FAIL"
    elif [[ "${#unknown_ui_checks[@]}" -gt 0 ]]; then
      status="PARTIAL"
    else
      status="PASS"
    fi

    if [[ "${#hard_fail_triggered[@]}" -gt 0 ]]; then
      status="FAIL"
      local hf
      for hf in "${hard_fail_triggered[@]}"; do
        failed_checks+=("scoring:hard_fail:$hf")
      done
    elif [[ -n "$soft_threshold" ]]; then
      if [[ "$soft_score_pass" -eq 1 ]]; then
        if [[ "$status" == "FAIL" ]]; then
          status="PARTIAL"
        fi
      else
        failed_checks+=("scoring:soft_score_below_threshold")
        status="FAIL"
      fi
    fi

    local fail_json unknown_json pass_json missing_sources_json missing_numbers_json missing_morning_json hard_fail_json
    fail_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"
    unknown_json="$(printf '%s\n' "${unknown_ui_checks[@]:-}" | to_json_array_from_stdin)"
    pass_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"
    missing_sources_json="$(jq -c '.missing' <<<"$required_sources_score")"
    missing_numbers_json="$(jq -c '.missing' <<<"$numeric_score")"
    missing_morning_json="$(jq -c '.missing' <<<"$morning_brief_score")"
    hard_fail_json="$(printf '%s\n' "${hard_fail_triggered[@]:-}" | to_json_array_from_stdin)"

    jq -n \
      --arg id "$case_id" \
      --arg prompt "$prompt" \
      --arg outcome "$outcome" \
      --arg status "$status" \
      --arg snapshot "$snapshot" \
      --argjson failed "$fail_json" \
      --argjson unknown "$unknown_json" \
      --argjson passed "$pass_json" \
      --argjson required_sources "$(jq -c '.expected.required_sources // []' <<<"$case_json")" \
      --argjson missing_sources "$missing_sources_json" \
      --argjson missing_numbers "$missing_numbers_json" \
      --argjson missing_morning_brief_checks "$missing_morning_json" \
      --argjson hard_fail_triggered "$hard_fail_json" \
      --arg soft_score "$soft_score" \
      --arg soft_threshold "$soft_threshold" \
      --argjson soft_pass "$soft_score_pass" \
      --arg tool_score "$tool_score" \
      --arg synth_score "$synth_score" \
      --arg numeric_score_val "$numeric_score_val" \
      --arg uncertainty_score_val "$uncertainty_score_val" \
      --arg formatting_score "$formatting_score" \
      --arg morning_brief_score_val "$morning_brief_score_val" \
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
        metrics: {
          synthesis: {
            required_sources: $required_sources,
            missing_sources: $missing_sources,
            missing_numbers: $missing_numbers
          },
          morning_brief: {
            missing_checks: $missing_morning_brief_checks
          },
          scoring: {
            groups: {
              tool_hygiene: ($tool_score | tonumber),
              synthesis_coverage: ($synth_score | tonumber),
              numeric_grounding: ($numeric_score_val | tonumber),
              uncertainty: ($uncertainty_score_val | tonumber),
              formatting: ($formatting_score | tonumber),
              morning_brief_contract: ($morning_brief_score_val | tonumber)
            },
            hard_fail_triggered: $hard_fail_triggered,
            soft_score: {
              value: ($soft_score | tonumber),
              threshold: (if $soft_threshold == "" then null else ($soft_threshold | tonumber) end),
              passed: ($soft_pass == 1)
            }
          }
        },
        snapshot_excerpt: ($snapshot | split("\n")[:40])
      }'
    return
  fi

  if [[ "${#failed_checks[@]}" -gt 0 ]]; then
    status="FAIL"
  elif [[ "${#unknown_ui_checks[@]}" -gt 0 ]]; then
    status="PARTIAL"
  fi

  local fail_json unknown_json pass_json
  fail_json="$(printf '%s\n' "${failed_checks[@]:-}" | to_json_array_from_stdin)"
  unknown_json="$(printf '%s\n' "${unknown_ui_checks[@]:-}" | to_json_array_from_stdin)"
  pass_json="$(printf '%s\n' "${passed_checks[@]:-}" | to_json_array_from_stdin)"

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
      metrics: {
        synthesis: {
          required_sources: [],
          missing_sources: [],
          missing_numbers: []
        },
        morning_brief: {
          missing_checks: []
        },
        scoring: {
          groups: {
            tool_hygiene: 0,
            synthesis_coverage: 0,
            numeric_grounding: 0,
            uncertainty: 0,
            formatting: 0,
            morning_brief_contract: 0
          },
          hard_fail_triggered: [],
          soft_score: {
            value: 0,
            threshold: null,
            passed: true
          }
        }
      },
      snapshot_excerpt: ($snapshot | split("\n")[:40])
    }'
}

run_self_tests() {
  require_cmd jq
  require_cmd rg

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  local fake_segment="$tmp/segment.log"
  cat > "$fake_segment" <<'LOG'
{"source":"tool.add_component","event":"start"}
{"source":"tool.add_component","event":"result","success":true}
{"source":"tool.add_component","event":"result","success":false,"missingFields":["channelId"]}
LOG

  if ! telemetry_expectation_matches "$fake_segment" "tool.add_component start"; then
    echo "SELF-TEST FAIL: telemetry start expectation"
    return 1
  fi
  if ! telemetry_expectation_matches "$fake_segment" "tool.add_component result success:true"; then
    echo "SELF-TEST FAIL: telemetry success expectation"
    return 1
  fi
  if ! telemetry_expectation_matches "$fake_segment" "success:false with missingFields containing channelId"; then
    echo "SELF-TEST FAIL: telemetry missingFields expectation"
    return 1
  fi

  local sample_snapshot
  sample_snapshot=$'Signals\nGitHub: 12 commits\nSlack: 4 mentions\nPostHog: 97 sessions\nASSUMPTION: Slack sample window is partial.'
  sample_snapshot+=$'\nToday\'s Mission: Stabilize release because blocker trend increased.\nEvidence: GitHub blockers observed 15 minutes ago.'
  sample_snapshot+=$'\n- Triage blockers\n- Reassign reviewers\nReframe mission\nLower priority\nUse different objective\nSnooze'

  local sample_case
  sample_case='{
    "expected": {
      "required_sources": ["github", "slack", "posthog"],
      "must_ground_numbers": [
        {"label":"github line", "regex":"GitHub:[^\\n]{0,30}[0-9]+"},
        {"label":"slack line", "regex":"Slack:[^\\n]{0,30}[0-9]+"},
        {"label":"posthog line", "regex":"PostHog:[^\\n]{0,30}[0-9]+"}
      ],
      "must_label_assumptions": true,
      "must_match_regex": ["Signals", "ASSUMPTION:"],
      "must_not_match_regex": ["HallucinatedSource"],
      "required_levers": 2,
      "claim_evidence_alignment": true,
      "evidence_freshness_max_age_minutes": 180,
      "must_allow_override_actions": ["Reframe mission", "Lower priority", "Use different objective", "Snooze"]
    }
  }'

  local rs ng as rx mb
  rs="$(score_required_sources "$sample_case" "$sample_snapshot")"
  ng="$(score_numeric_grounding "$sample_case" "$sample_snapshot")"
  as="$(score_assumption_labeling "$sample_case" "$sample_snapshot")"
  rx="$(score_regex_constraints "$sample_case" "$sample_snapshot")"
  mb="$(score_morning_brief_contract "$sample_case" "$sample_snapshot")"

  if [[ "$(jq -r '.passed == .total' <<<"$rs")" != "true" ]]; then
    echo "SELF-TEST FAIL: required_sources scoring"
    return 1
  fi
  if [[ "$(jq -r '.passed == .total' <<<"$ng")" != "true" ]]; then
    echo "SELF-TEST FAIL: numeric grounding scoring"
    return 1
  fi
  if [[ "$(jq -r '.passed == 1 and .required == true' <<<"$as")" != "true" ]]; then
    echo "SELF-TEST FAIL: assumption labeling scoring"
    return 1
  fi
  if [[ "$(jq -r '.passed == .total' <<<"$rx")" != "true" ]]; then
    echo "SELF-TEST FAIL: regex constraint scoring"
    return 1
  fi
  if [[ "$(jq -r '.passed == .total' <<<"$mb")" != "true" ]]; then
    echo "SELF-TEST FAIL: morning brief contract scoring"
    return 1
  fi

  echo "SELF-TEST PASS"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --eval-file) EVAL_FILE="${2:-}"; shift 2 ;;
      --app-url) APP_URL="${2:-}"; shift 2 ;;
      --space-url) SPACE_URL="${2:-}"; shift 2 ;;
      --cases) CASES_ARG="${2:-}"; shift 2 ;;
      --wait-ms) WAIT_MS="${2:-}"; shift 2 ;;
      --session) SESSION="${2:-}"; shift 2 ;;
      --list) LIST_ONLY=1; shift ;;
      --self-test) SELF_TEST=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
    esac
  done

  if [[ "$SELF_TEST" -eq 1 ]]; then
    run_self_tests
    exit 0
  fi

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
    jq -r '.cases[] | "\(.id)\t\(.category // "general")\t\(.prompt)"' "$EVAL_FILE"
    exit 0
  fi

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

  local all_case_ids=()
  while IFS= read -r id; do
    all_case_ids+=("$id")
  done < <(jq -r '.cases[].id' "$EVAL_FILE")

  local case_ids=()
  if [[ -n "$CASES_ARG" ]]; then
    IFS=',' read -r -a case_ids <<<"$CASES_ARG"
  else
    case_ids=("${all_case_ids[@]}")
  fi

  contains_case_id() {
    local target="$1"
    local id
    for id in "${all_case_ids[@]}"; do
      if [[ "$id" == "$target" ]]; then
        return 0
      fi
    done
    return 1
  }

  local id
  for id in "${case_ids[@]}"; do
    if ! contains_case_id "$id"; then
      echo "Unknown case ID: $id" >&2
      exit 1
    fi
  done

  echo "Running minimum eval set with session: $SESSION"
  echo "Eval file: $EVAL_FILE"
  echo "Telemetry log: $LOG_PATH"

  local case_results_json="[]"
  local case_result case_status case_id
  for case_id in "${case_ids[@]}"; do
    echo "→ Case $case_id"
    case_result="$(run_case "$case_id")"
    case_status="$(jq -r '.status' <<<"$case_result")"
    echo "  $case_status"
    case_results_json="$(jq -c --argjson current "$case_results_json" --argjson item "$case_result" '$current + [$item]' <<< '{}')"
  done

  local summary_json
  summary_json="$(jq -n --argjson cases "$case_results_json" '
    {
      pass: ($cases | map(select(.status=="PASS")) | length),
      fail: ($cases | map(select(.status=="FAIL")) | length),
      partial: ($cases | map(select(.status=="PARTIAL")) | length),
      total: ($cases | length),
      avg_soft_score: (
        ($cases | map(.metrics.scoring.soft_score.value // empty) | map(select(type == "number")) ) as $scores |
        if ($scores | length) == 0 then null else (($scores | add) / ($scores | length)) end
      )
    }
  ' )"

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
    echo "- Avg soft score: $(jq -r '.avg_soft_score // "n/a"' <<<"$summary_json")"
    echo
    echo "## Cases"
    echo
    echo "| Case | Status | Soft Score | Missing Sources | Missing Numbers | Failed Checks | Unknown UI Checks |"
    echo "|---|---|---:|---|---|---|---|"
    jq -r '
      .cases[] |
      [
        .id,
        .status,
        ((.metrics.scoring.soft_score.value // 0) | tostring),
        ((.metrics.synthesis.missing_sources // []) | join(", ")),
        ((.metrics.synthesis.missing_numbers // []) | join(", ")),
        (.checks.failed | join("; ")),
        (.checks.unknown_ui | join("; "))
      ] |
      "| " + join(" | ") + " |"
    ' "$RESULT_JSON"
  } > "$RESULT_MD"

  echo "Wrote:"
  echo "  $RESULT_JSON"
  echo "  $RESULT_MD"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
