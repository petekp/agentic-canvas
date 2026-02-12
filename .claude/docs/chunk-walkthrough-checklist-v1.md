# Chunk Walkthrough Checklist (Morning Brief v2)

Last updated: 2026-02-12  
Status: Required process for rewrite slices

## Per-chunk checklist

1. Define one chunk boundary:
   - examples: `contracts`, `validation`, `projection`, `reasoner`, `route`, `tests`, `docs`.
2. Capture source intent before coding:
   - quote relevant OpenClaw/pi-mono constraint in the chunk notes.
3. Write/adjust tests first for the chunk.
4. Implement chunk with smallest possible surface.
5. Verify:
   - targeted tests for that chunk
   - no schema drift
   - no hidden fallback logic expansion
6. Record post-implementation notes:
   - what changed
   - what remains
   - next chunk input assumptions

## Citation rule (hard requirement)

Each chunk note must include at least one primary-source citation from:

- `/Users/petepetrash/Code/agentic-canvas/.claude/plans/morning-brief-openclaw-principles-v0.1.md`
- `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/read.ts`
- `/Users/petepetrash/Code/pi-mono/packages/mom/src/tools/write.ts`
- `/Users/petepetrash/Code/pi-mono/packages/mom/docs/new.md`
- `/Users/petepetrash/Code/pi-mono/README.md`

Local project files can be cited in addition, but not as the only citation source.

## Anti-contamination checks

1. Do not copy v0 prototype assumptions into v2 contracts.
2. Do not re-introduce heuristic prioritization into fallback.
3. Do not move citations into code comments; keep them in docs/evals/chunk notes.
4. If an old plan conflicts with v2 rewrite docs, treat v2 rewrite docs as authoritative for implementation.
