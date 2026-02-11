# Minimum Eval Results

- Generated at: 2026-02-11T04:19:10Z
- Eval file: `.claude/evals/minimum-eval-set.v0.1.json`
- App URL: `http://localhost:3003`
- Session: `min-eval-1770783508`
- Telemetry log: `.claude/telemetry/agentic-canvas.log`

## Summary

- Pass: 1
- Fail: 2
- Partial: 0
- Total: 3

## Cases

| Case | Status | Failed Checks | Unknown UI Checks |
|---|---|---|---|
| G1 | PASS |  |  |
| W1 | FAIL | ui:Active space title becomes Weekly Review. |  |
| E1 | FAIL | tool_calls_any; outcome:graceful_error; ui:Assistant reports component was not found, without claiming success. |  |
