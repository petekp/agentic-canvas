# Founder Interview Capture: Morning Brief v1 Direction (2026-02-12)

Last updated: 2026-02-12
Owner: User + assistant
Status: Canonical reference for rewrite direction

## Why this exists

This captures product and architecture decisions provided directly by the user during interview + follow-up clarification, so agents do not re-open settled questions.

## Canonical thesis

Agentic Canvas is a personalized, predictive, anticipatory, proactive engine orchestrated by agents/subagents with filesystem access and tool/data-source access (MCP/REST), dynamically assembling UI that matches intent and always pairs information with predictive next-step recommendations or invitations to build shared context.

## User 0

- User 0 is the founder/operator (the user).
- Working context includes ADHD-related organization and long-horizon planning challenges.
- Reference profile:
  - `/Users/petepetrash/Code/personality/deep_personality_profile.json`
  - `/Users/petepetrash/Code/personality/deep_personality_profile.md`

## Morning v1 jobs (top priority outcomes)

1. Show what was accomplished yesterday.
2. Predict best focus areas for today and present likely-reaction shortcuts.
3. Provide the best toolkit for understanding/executing the chosen focus.

## Locked decisions (do not re-debate unless user asks)

- Non-goals for v1: auth/accounts/profiles/organizations.
- Deployment posture: single-user, local-first, open source.
- Rewrite posture: hard greenfield with selective ideas only, not legacy carry-forward.
- Architecture bet: LLM-first with deterministic safety rails.
- Priority strategy: hybrid, with mutable prompt-based rules rather than rigid hardcoded policy.
- Quality bar: genuinely useful and surprising; eval-driven; TDD for non-prompt code.
- Success metrics:
  1. Morning clarity + agreement.
  2. Confidence/preparedness for Friday recap/productivity outcomes.
  3. Ingenious, hygienic agent environment with accessible context.

## Filesystem + runtime direction

- First-class candidate primitives: spaces, memory, heartbeat, cron.
- Storage direction: lightweight dotfile directory, likely sqlite-backed.
- Scheduled behavior day one:
  - Morning brief refresh every 24 hours.
  - Arbitrary forward-deployed agents for research/context management, invoked by assistant/user/CTA.
- pi-mono role: evaluate case by case; no blanket runtime commitment yet.

## Output/modeling philosophy

- Do not over-prescribe a rigid ontology too early.
- Prefer lightweight, natural-language/markdown-friendly structures that agents can evolve.
- Treat todos as common component form, not necessarily a system primitive.
- Canonical output section order is intentionally still open and should be triangulated over time.

## Principles adherence review policy intent

- DeepWiki research against both `pi-mono` and `openclaw` is required for behavior-changing work.
- Purpose is architectural comparison and intentional divergence decisions, not box-checking.
- We are explicitly betting on filesystem-capable, tool-using, inference-forward agent systems.

## Clarifications from follow-up review (same day)

- Questions 1-3 from prior interview were already covered in existing docs.
- Contract stability boundaries should be reviewed explicitly (not assumed).
- Tests are primarily to keep coding agents on track and prevent regressions.
- v0 coupling is case-by-case; we are not bound to v0.
- Rollback planning is not a priority in current early design phase.
- Current telemetry priority is autonomous debugging efficiency for coding agents.
- Ownership of principles-adherence notes: shared (user + assistant).
- Correctness and speed are not treated as opposites; correctness should increase speed.

## Known open questions

- Final canonical morning brief section order and shape.
- Mandatory per-item field ontology (if any).
- Memory model details (what to persist, compaction strategy, exclusions).
- Minimum bridge surface in legacy repo during transition.
- Exact role split between agent runtime, mutable prompts, and deterministic code boundaries.

## Source references consulted

- This repo:
  - `.claude/docs/agentic-alignment-openclaw-pi-mono-v0.1.md`
  - `.claude/docs/rewrite-onboarding-v1.md`
  - `.claude/docs/knowledge-map-morning-brief-v2.md`
- Previous repo knowledge context:
  - `/Users/petepetrash/Code/agentic-canvas/.claude/plans/user0-morning-brief-profile-v0.1.md`
  - `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-lifecycle-v0.1.md`
  - `/Users/petepetrash/Code/agentic-canvas/.claude/shaping.md`
