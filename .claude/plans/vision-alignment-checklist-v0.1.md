# Vision Alignment Checklist v0.1

Last updated: 2026-02-11

Use this checklist for any non-trivial slice before merge.

## 1) Use-Case Fit (Required)

- [ ] This slice directly improves at least one P0 use case in `.claude/plans/dogfood-use-cases-v0.1.md`.
- [ ] The PR/plan names the specific use case ID (`UC-1` ... `UC-5`).
- [ ] The change makes a real user workflow better, not only internal refactor.

## 2) Morning Orientation Fit (Required)

- [ ] The change improves at least one of: clarity, prioritization, or actionability.
- [ ] The user can answer "what matters now?" faster or with higher confidence after this change.

## 3) Mercurial Interface Fit (Required)

- [ ] The change improves synthesis from signals (connectors, memory, preferences), OR
- [ ] The change improves adaptive presentation (component choice/format/layout), OR
- [ ] The change improves personalization behavior.

At least one box above must be true.

## 4) Reliability + Trust Fit (Required)

- [ ] Tool execution path remains stable (no call/result drops).
- [ ] Telemetry makes the behavior observable for debugging.
- [ ] Ledger integrity remains verifiable for relevant runs.

## 5) Validation Quality (Required)

- [ ] There is at least one deterministic test covering the new behavior or regression.
- [ ] There is a manual prompt-based validation path documented in the PR/plan notes.
- [ ] If behavior is model-variant, fallback/normalization is explicit in code.

## 6) Scope Discipline (Required)

- [ ] Scope stays within local prototype boundaries in `.claude/plans/pi-local-prototype-scope-v0.1.md`.
- [ ] No unrelated architectural expansion is bundled into this slice.

## 7) Completion Note (Required)

When finishing a slice, record:

- Use case improved:
- User-visible unlock:
- Evidence:
  - test name(s)
  - telemetry event(s)
  - ledger parity check (if tool flow touched)
