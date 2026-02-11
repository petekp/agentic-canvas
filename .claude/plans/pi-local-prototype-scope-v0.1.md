# Pi Local Prototype Scope Contract (v0.1)

**Status:** Active scope guardrail  
**Date:** 2026-02-11  
**Owner:** Agentic Canvas (local prototype track)

## Purpose

Keep `pi` agent + filesystem interaction work as a **local development prototype**.

This document is a hard boundary. Work outside this boundary requires explicit approval.

## Product Boundary

This prototype is:

- Single-user
- Localhost-only
- Filesystem-first
- No production infrastructure dependency

This prototype is not:

- Multi-user SaaS
- Production deployment target
- Database-backed system

## In-Scope

1. Keep existing assistant-ui UX and chat flow.
2. Continue backend orchestration through `pi-phase1-adapter` and `pi-runtime`.
3. Enable minimal filesystem agent capability for local project files only.
4. Persist runtime artifacts in local filesystem (`.runtime/pi/...`).
5. Use local evals/smoke checks for validation.

## Out-of-Scope (Do Not Build)

1. Cloud database, migrations, ORM adoption.
2. Authentication, RBAC, org/team models.
3. Background workers/queues for production scale.
4. Hosted observability/alerting stack requirements.
5. Billing, quotas, usage metering.
6. Enterprise compliance features beyond minimal local safeguards.
7. Cross-device sync or remote shared state.

## Filesystem Agent Scope (Minimal)

Allowed initial tool surface:

- `list_dir`
- `read_file`
- `write_file`
- `edit_file`

Optional (off by default):

- `delete_file` (only when explicitly enabled via env)

Required safeguards:

- Restrict operations to a configured allowed root (workspace path).
- Block path traversal and symlink escape attempts.
- Enforce file size and operation-count limits.
- Require explicit confirmation for destructive actions.

## Runtime + Infra Constraints

1. Run via `pnpm dev` on localhost.
2. No requirement for production cron or external scheduler.
3. Retention can run in-traffic and/or manual endpoint invocation in local env.
4. No required external database for state.

## Evaluation Strategy (Prototype)

Start evals as soon as tool slices are available:

1. Contract evals (policy + path safety) can start immediately after tool contracts are defined.
2. Read-only evals after `list_dir` + `read_file`.
3. Mutation evals after `write_file` + `edit_file`.
4. Adversarial evals for unsafe path attempts and prompt-injection style misuse.

Mandatory for each slice:

- Unit tests for safety checks.
- End-to-end local smoke run.

## Definition of Done (Prototype Track)

1. On localhost, assistant can safely read and edit files under allowed root.
2. Unsafe path operations are blocked reliably.
3. Local eval suite passes.
4. No database/auth/production infra is required to run or demo.

## Implementation Status (2026-02-11)

- [x] Minimal filesystem tool surface implemented:
  - `list_dir`, `read_file`, `write_file`, `edit_file`
  - Optional `delete_file` behind env gate
- [x] Safety guardrails implemented:
  - Allowed-root restriction
  - Traversal and symlink escape prevention
  - Read/write/list/edit operation limits
  - Destructive confirmation requirement for delete
- [x] Eval phases wired and passing:
  - Contract/path-safety evals
  - Read-only evals
  - Mutation evals
  - Adversarial evals
  - Local filesystem smoke run

## Change Control

Any proposal that adds production-only infrastructure (DB/auth/queue/hosted ops) must:

1. Be documented as a separate plan, and
2. Be explicitly approved before implementation.

Until then, default decision is **defer**.
