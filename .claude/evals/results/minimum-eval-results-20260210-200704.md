# Minimum Eval Results

- Generated at: 2026-02-11T04:09:11Z
- Eval file: `.claude/evals/minimum-eval-set.v0.1.json`
- App URL: `http://localhost:3003`
- Session: `min-eval-1770782824`
- Telemetry log: `.claude/telemetry/agentic-canvas.log`

## Summary

- Pass: 7
- Fail: 3
- Partial: 0
- Total: 10

## Cases

| Case | Status | Failed Checks | Unknown UI Checks |
|---|---|---|---|
| G1 | PASS |  |  |
| G2 | PASS |  |  |
| S1 | PASS |  |  |
| S2 | PASS |  |  |
| V1 | PASS |  |  |
| P1 | PASS |  |  |
| R1 | PASS |  |  |
| T1 | FAIL | tool_calls_any; outcome:tool_success |  |
| W1 | FAIL | ui:Active space title becomes Weekly Review. |  |
| E1 | FAIL | tool_calls_any; outcome:graceful_error |  |
