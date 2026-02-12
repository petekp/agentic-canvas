# Knowledge Audit (2026-02-12): Morning Brief Rewrite

## Objective

Reduce v0 prototype cross-contamination in active morning-brief implementation guidance.

## Findings

1. `morning-brief-lifecycle-v0.1.md` is still useful for product intent/state model, but can be misread as the implementation playbook.
2. There was no local canonical rewrite onboarding doc for `agentic-canvas-v2`.
3. There was no explicit checklist requiring primary-source citations in chunk walkthrough docs.

## Remediations completed

1. Added rewrite alignment doc:
   - `.claude/docs/agentic-alignment-openclaw-pi-mono-v0.1.md`
2. Added chunk walkthrough checklist with hard citation rule:
   - `.claude/docs/chunk-walkthrough-checklist-v1.md`
3. Added rewrite onboarding doc:
   - `.claude/docs/rewrite-onboarding-v1.md`
4. Added chunk-by-chunk notes with explicit OpenClaw/pi-mono citations:
   - `.claude/docs/chunk-notes-morning-brief-v2-2026-02-12.md`
5. Added note in lifecycle plan to redirect active implementation to rewrite docs:
   - `.claude/plans/morning-brief-lifecycle-v0.1.md`

## Remaining risks

1. Historical v0 plan files remain in `.claude/plans/` and are still valid for legacy context.
2. Without explicit mention of rewrite docs in future changelog entries, new agents may default to older docs.

## Recommendation

Treat these as canonical for active rewrite implementation:

- `.claude/docs/rewrite-onboarding-v1.md`
- `.claude/docs/agentic-alignment-openclaw-pi-mono-v0.1.md`
- `.claude/docs/chunk-walkthrough-checklist-v1.md`
