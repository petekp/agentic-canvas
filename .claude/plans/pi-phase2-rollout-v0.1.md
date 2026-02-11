# Pi Phase-2 Rollout Plan (v0.1)

**Status:** Proposed for implementation  
**Date:** 2026-02-11  
**Owner:** Agentic Canvas backend/runtime

## Goal

Promote phase-1 `pi` runtime seam into a production-ready phase-2 rollout:

- live external `pi-mono` runtime in target environments
- repeatable release smoke checks
- scheduled retention (not only in-traffic execution)
- clear rollback path

## Scope

In scope:

- Runtime env defaults and verification
- Release smoke checks for `/api/pi/runtime`, `/api/pi/retention`, `/api/chat`
- Retention scheduling strategy and operational guardrails
- Staged rollout process (staging -> canary -> full)

Out of scope:

- Assistant-ui client/runtime replacement
- Server-side execution of canvas tools
- Broad Morning Brief product redesign

## Exit Criteria

1. Staging and production run with `PI_RUNTIME_ENGINE_MODULE` configured.
2. Runtime diagnostics confirm external engine load in target environments.
3. Retention runs on a schedule (plus existing in-traffic scheduling).
4. Release smoke script is part of deploy verification.
5. Rollback to internal runtime is documented and tested.

## Environment Baseline

Set and verify in deployment environments:

```bash
PI_RUNTIME_ENGINE_MODULE=<path-or-specifier>
PI_RUNTIME_ENGINE_EXPORT=
PI_MONO_PROVIDER=openai
PI_MONO_MODEL=gpt-4o-mini
PI_MONO_DRY_RUN=
PI_EPISODE_LOG_DISABLED=0
PI_RUNTIME_DIAGNOSTICS_ENABLED=1
PI_RETENTION_API_TOKEN=<token-for-cron-and-smoke>
```

## PR Checklist

- [ ] Runtime env defaults are set for staging.
- [ ] Runtime diagnostics endpoint returns external engine metadata.
- [ ] Release smoke script passes against staging URL.
- [ ] Scheduled retention is configured and authenticated.
- [ ] Telemetry/alerts are wired for runtime and retention failures.
- [ ] Canary production rollout completed with no critical errors for 24-48h.
- [ ] Full rollout completed.
- [ ] Rollback procedure validated.

## Release Smoke Command

Run against the target environment:

```bash
PI_SMOKE_BASE_URL="https://<target-host>" \
PI_SMOKE_EXPECT_ENGINE_SOURCE="external" \
PI_RETENTION_API_TOKEN="<token-if-required>" \
pnpm run eval:pi:phase2:smoke
```

Optional dry-run expectation:

```bash
PI_SMOKE_EXPECT_CHAT_TEXT="pi-mono dry run" pnpm run eval:pi:phase2:smoke
```

## Scheduled Retention

Target cadence:

- every 1-6 hours via cron/task scheduler
- call `POST /api/pi/retention` with bearer token
- keep in-traffic scheduler enabled as fallback

Minimum telemetry checks per run:

- `api.pi.retention` `run` emitted
- no `api.pi.retention` `run_error`

## Rollout Stages

### Stage 1: Staging

- Enable live external engine.
- Run smoke script.
- Validate telemetry and tool loop behavior.

### Stage 2: Canary Production

- Enable for limited workspace subset or single environment slice.
- Monitor 24-48h for:
  - `pi.runtime.engine_load_error`
  - `api.chat.stream_error`
  - `pi.runtime.history_tool_results_ingest_error`
  - `api.pi.retention.run_error`

### Stage 3: Full Production

- Expand to full traffic.
- Keep diagnostics enabled for operational verification.

## Rollback

Fast rollback path:

1. Unset `PI_RUNTIME_ENGINE_MODULE`.
2. Redeploy/restart.
3. Confirm `/api/pi/runtime` shows internal fallback engine.
4. Re-run smoke checks.

## Ownership Notes

- Keep runtime seam thin (`pi-phase1-adapter` -> `pi-runtime`).
- Prefer existing `pi-mono`/AI SDK utilities over custom protocol code.
- Keep assistant-ui route contract unchanged while iterating backend runtime.
