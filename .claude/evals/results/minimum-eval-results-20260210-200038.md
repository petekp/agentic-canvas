# Minimum Eval Results

- Generated at: 2026-02-11T04:01:41Z
- Eval file: `.claude/evals/minimum-eval-set.v0.1.json`
- App URL: `http://localhost:3003`
- Session: `min-eval-1770782438`
- Telemetry log: `.claude/telemetry/agentic-canvas.log`

## Summary

- Pass: 5
- Fail: 4
- Partial: 1
- Total: 10

## Cases

| Case | Status | Failed Checks | Unknown UI Checks |
|---|---|---|---|
| G1 | FAIL | tool_calls_any; outcome:tool_success |  |
| G2 | PASS |  |  |
| S1 | PARTIAL |  | Slack channel picker is shown (option list). |
| S2 | PASS |  |  |
| V1 | PASS |  |  |
| P1 | PASS |  |  |
| R1 | PASS |  |  |
| T1 | FAIL | tool_calls_any; outcome:tool_success |  |
| W1 | FAIL | ui:Active space title becomes Weekly Review. |  |
| E1 | FAIL | tool_calls_any; outcome:graceful_error; ui:Assistant reports component was not found, without claiming success. |  |
