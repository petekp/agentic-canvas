# Minimum Eval Set

This directory defines a compact baseline for assistant behavior in the live app.

## Files

- `minimum-eval-set.v0.1.json`: machine-readable eval cases
  - Optional `setup_prompts` per case run before the main prompt to satisfy preconditions.

## How to run (manual, repeatable)

1. Start app: `pnpm dev` (or ensure `http://localhost:3003` is running).
2. Open the target space.
3. For each case in order, submit the prompt verbatim.
4. Record pass/fail and notes.
5. Validate telemetry:

```bash
rg "tool\\.(add_component|add_filtered_component|set_preference_rules|generate_template|create_space|remove_component)" .claude/telemetry/agentic-canvas.log | tail -n 120
```

## Scoring

- `PASS`: expected outcome and required tool behavior matched.
- `FAIL`: wrong tool choice, wrong user-facing behavior, or missing UI outcome.
- `PARTIAL`: core behavior worked but messaging/details differed.

Supported outcomes:
- `tool_success`: at least one expected tool returned `success:true`.
- `tool_started`: at least one expected tool started (useful when navigation interrupts telemetry result lines).
- `needs_input`, `graceful_block`, `graceful_error`.

## Why this set is "minimum"

- Covers each currently available integration surface (Slack, PostHog, Vercel, GitHub-without-token fallback)
- Covers space creation and template generation
- Covers one personalization flow (`set_preference_rules`)
- Covers one explicit error-handling case
