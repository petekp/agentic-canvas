# Minimum Eval Results

- Generated at: 2026-02-11T04:17:20Z
- Eval file: `.claude/evals/minimum-eval-set.v0.1.json`
- App URL: `http://localhost:3003`
- Session: `min-eval-1770783317`
- Telemetry log: `.claude/telemetry/agentic-canvas.log`

## Summary

- Pass: 6
- Fail: 4
- Partial: 0
- Total: 10

## Cases

| Case | Status | Failed Checks | Unknown UI Checks |
|---|---|---|---|
| G1 | FAIL | outcome:tool_success |  |
| G2 | PASS |  |  |
| S1 | PASS |  |  |
| S2 | PASS |  |  |
| V1 | PASS |  |  |
| P1 | PASS |  |  |
| R1 | PASS |  |  |
| T1 | FAIL | tool_calls_any; outcome:tool_success |  |
| W1 | FAIL | ui:Active space title becomes Weekly Review. |  |
| E1 | FAIL | tool_calls_any; outcome:graceful_error; ui:Assistant reports component was not found, without claiming success. |  |
