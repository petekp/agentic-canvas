# Evals

This directory defines eval suites for validating assistant behavior in the live app.

## Files

- `minimum-eval-set.v0.1.json`
  - Baseline tool hygiene checks (tool start/success/failure, UI hints, graceful handling).
- `synthesis-eval-set.v0.2.json`
  - Cross-source synthesis quality checks (GitHub + Slack + PostHog) with source coverage, numeric grounding, uncertainty labeling, and formatting constraints.
- `synthesis-eval-set.v0.3.json`
  - Morning Brief contract checks for lever count, claim/evidence alignment, freshness bounds, and override control visibility.
- `results/*`
  - Timestamped JSON + Markdown outputs from runner executions.

## Runner

Use `scripts/run-min-evals.sh`.

```bash
# List cases in an eval file
./scripts/run-min-evals.sh --eval-file .claude/evals/synthesis-eval-set.v0.2.json --list

# Run selected cases
./scripts/run-min-evals.sh --eval-file .claude/evals/synthesis-eval-set.v0.2.json --cases SYN1,SYN2

# Run all cases
./scripts/run-min-evals.sh --eval-file .claude/evals/synthesis-eval-set.v0.2.json

# Runner internal self-tests (schema/scoring primitives)
./scripts/run-min-evals.sh --self-test
```

## v0.1 Case Shape (still supported)

```json
{
  "id": "G1",
  "category": "github",
  "prompt": "...",
  "expected": {
    "outcome": "tool_success",
    "tool_calls_any": ["add_component"],
    "tool_calls_none": ["add_filtered_component"],
    "must_not_say": ["..."],
    "must_say_any": ["..."],
    "ui": ["A GitHub my-activity component is visible."],
    "telemetry": ["tool.add_component result success:true"]
  }
}
```

## v0.2 Additions

v0.2 keeps all v0.1 fields and adds synthesis-oriented checks under `expected`.

### `required_sources`

All listed sources must appear in the final response context.

```json
"required_sources": ["github", "slack", "posthog"]
```

Optional source-specific phrase overrides:

```json
"source_patterns": {
  "github": ["GitHub", "PR"],
  "slack": ["Slack", "mentions"],
  "posthog": ["PostHog", "site health"]
}
```

### `must_ground_numbers`

Require numeric grounding in the response. Supports either exact value matching or regex patterns.

```json
"must_ground_numbers": [
  { "label": "risk score", "regex": "RISK_SCORE:\\s*[0-9]{1,3}" },
  { "label": "github signal", "value": "12", "context_any": ["GitHub"] }
]
```

### `must_label_assumptions`

Require explicit uncertainty/assumption language when evidence is missing/noisy/stale.

```json
"must_label_assumptions": true,
"assumption_markers_any": ["ASSUMPTION 1:", "ASSUMPTION 2:"]
```

If `assumption_markers_any` is omitted, default markers are used (`assumption`, `assuming`, `uncertain`, etc.).

### `must_match_regex` / `must_not_match_regex`

Formatting/content constraints on the assistant response.

```json
"must_match_regex": ["Signals", "Recommendation", "GitHub:\\s*[0-9]+"],
"must_not_match_regex": ["HallucinatedSource"]
```

### `scoring` (optional)

Supports hard-fail groups and weighted soft scoring.

```json
"scoring": {
  "hard_fail": ["synthesis_coverage", "numeric_grounding", "uncertainty", "formatting"],
  "soft_score": {
    "threshold": 0.8,
    "weights": {
      "synthesis_coverage": 0.35,
      "numeric_grounding": 0.30,
      "uncertainty": 0.20,
      "formatting": 0.15
    }
  }
}
```

Available scoring groups:

- `tool_hygiene`
- `synthesis_coverage`
- `numeric_grounding`
- `uncertainty`
- `formatting`

## v0.3 Additions (Morning Brief Contract)

v0.3 adds optional `expected` fields for Morning Brief lifecycle quality:

```json
{
  "required_levers": 2,
  "claim_evidence_alignment": true,
  "evidence_freshness_max_age_minutes": 180,
  "must_allow_override_actions": [
    "Reframe mission",
    "Lower priority",
    "Use different objective",
    "Snooze"
  ]
}
```

Optional regex overrides:

```json
{
  "lever_regex": "(?im)^(?:[-*]|[0-9]+\\.)\\s+.+",
  "claim_marker_regex": "(?i)(today.?s mission|mission|recommendation)",
  "evidence_marker_regex": "(?i)(evidence|source|observed|metric)",
  "alignment_marker_regex": "(?i)(because|based on|backed by|driven by)",
  "evidence_freshness_regex": "(?i)[0-9]{1,4}\\s*(?:m|min|minute|minutes)"
}
```

Additional scoring group available in `hard_fail`/`soft_score.weights`:

- `morning_brief_contract`

Behavior:

- Any failing `hard_fail` group => case `FAIL`.
- If `soft_score.threshold` is defined and weighted score is below threshold => case `FAIL`.
- If legacy checks fail but soft score passes (and no hard-fail triggered), case is downgraded to `PARTIAL` instead of `PASS`.

## Outcomes

Supported outcomes:

- `tool_success`
- `tool_started`
- `needs_input`
- `graceful_block`
- `graceful_error`
- `response_only` (v0.2; synthesis/content-only scoring path)

## Telemetry Assertions

`expected.telemetry` entries are now enforced by the runner.

Supported shorthand patterns:

- `tool.<name> start`
- `tool.<name> result success:true`
- `tool.<name> result success:false`
- `success:false with missingFields containing <field>`

Any other telemetry entry is treated as a case-insensitive fixed-string search in the per-case telemetry segment.

## Output Artifacts

Runner writes both:

- `.claude/evals/results/minimum-eval-results-<timestamp>.json`
- `.claude/evals/results/minimum-eval-results-<timestamp>.md`

Per-case output now includes synthesis metrics:

- missing required sources
- missing numeric grounding checks
- group scores (`tool_hygiene`, `synthesis_coverage`, `numeric_grounding`, `uncertainty`, `formatting`)
- soft score value/threshold/pass
- hard-fail groups triggered
