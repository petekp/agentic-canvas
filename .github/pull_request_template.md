## Summary

Describe what changed and why.

## Planning Gate (Required)

- [ ] I defined the public behavior/interface change before coding.
- [ ] I listed behaviors and mapped them to tests.
- [ ] For non-trivial work, I recorded a plan in `.claude/plans/`.

## TDD Gate (Required)

- [ ] I used the `tdd` skill workflow for this change.
- [ ] RED: I added/updated a failing test first.
- [ ] GREEN: I implemented the minimum code to pass.
- [ ] REFACTOR: I cleaned up with tests green.
- [ ] If this is a bug fix: I added a failing regression test first.
- [ ] If I did not change tests, I documented why this is a valid exception.

## Principles Adherence Review Gate (Required)

- [ ] I used the `deepwiki` skill to research both `pi-mono` and `openclaw`.
- [ ] I added/updated `.claude/docs/principles-adherence-<date>.md`.
- [ ] The review note includes: `deepwiki` queries, `pi-mono` findings, `openclaw` findings, and implications for this PR.
- [ ] I linked the review note path in this PR description.

## Repo Isolation Gate (Required)

- [ ] This PR does not add or modify v2 rewrite implementation artifacts in this repo.
- [ ] Forbidden paths were respected: `packages/agentic-canvas-v2/*`, `src/app/api/briefing/v2/*`, `src/lib/agentic-canvas-v2.ts`.

## Testing Gate (Required)

List exact commands and outcomes:

```bash
# Example
pnpm exec vitest run src/path/to/test.ts --config vitest.config.ts
```

- [ ] All relevant tests pass locally.
- [ ] Any unrelated existing failures are documented and tracked separately.
