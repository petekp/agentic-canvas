# Shape Up: Stabilization Bet — Make v0.1 Rock Solid

## Source

Re-evaluation of the existing Agentic Canvas v0.1 codebase through deep audit:
build verification, type checking, test suite analysis, dead code detection,
API route inspection, and structural analysis.

## Frame

**Problem:** The v0.1 codebase ships features across canvas, chat, spaces, undo,
and data integrations — but the build is broken, type safety has holes, deprecated
code is piling up, and several API routes have silent bugs. Building v0.2 on this
foundation is risky.

**Outcome:** A codebase that builds cleanly, passes type checking, has no dead code,
and where every existing feature actually works. Confident enough to build on.

---

## R — Requirements

### R1: Build must pass
`next build` currently fails. Cannot deploy.

### R2: Type checking must pass
`tsc --noEmit` currently shows 20+ errors across 5 files.

### R3: No dead code
Deprecated aliases, orphaned files, unused exports, and duplicate registries
create confusion and maintenance burden.

### R4: API routes must be correct
Silent bugs (wrong token types, missing validation) erode trust in data.

### R5: Tests must be type-safe
Tests pass at runtime but lie about type safety — TestStore doesn't match
the real AgenticCanvasStore.

### R6: No orphaned design artifacts
Types defined but never implemented (event system, placement engine, etc.)
should be removed or clearly marked as future spec.

---

## Audit Findings (Evidence for R)

### P0 — Build Blockers (R1)

| # | File | Line | Issue |
|---|------|------|-------|
| 1 | `src/lib/canvas-tools.tsx` | 993 | `AddComponentToolUI` declares `result` as required prop but assistant-ui's `ToolCallMessagePartComponent` passes it as optional. Build fails. |
| 2 | `src/lib/canvas-tools.tsx` | 1723 | Same issue for `AddFilteredComponentToolUI`. |
| 3 | `src/lib/undo/execute-command.ts` | 257-266 | Uses `ComponentInstance` type but never imports it. |

**Fix:** Make `result` optional in tool UI props (`result?: unknown`). Add missing import.

### P1 — Type Safety (R2, R5)

| # | File | Issue |
|---|------|-------|
| 4 | `src/store/data-slice.test.ts` | `TestStore` missing `ChatSlice` — incompatible with `AgenticCanvasStore` |
| 5 | `src/lib/assistant-actions.test.ts` | Same `TestStore` mismatch |
| 6 | `src/store/undo-system.test.ts` | Same `TestStore` mismatch |

Tests pass because vitest transpiles without type checking. `tsc --noEmit` catches them all.

**Fix:** Add `ChatSlice` to all `TestStore` definitions (and `NotificationSlice` where missing).

### P2 — Dead Code & Deprecated Cruft (R3)

#### Deprecated View→Space Aliases (all uncalled)
| Location | Count | Details |
|----------|-------|---------|
| `workspace-slice.ts:134-156,791-822` | 11 methods | `saveView`, `loadView`, `deleteView`, etc. — none called from any component |
| `hooks/index.ts:65-82` | 10 aliases | `useViews()`, `activeViewId`, `saveView`, etc. — never imported |
| `types/index.ts` | 7 types | `ViewId`, `View`, `SaveViewPayload`, `ViewSummary`, etc. |
| `undo-slice.ts:87-92` | 3 fields | `viewContext`, `beforeViewState`, `afterViewState` |
| `undo/types.ts:169-238` | 5 types/fields | `UndoViewContext`, deprecated field aliases |

**Total: ~36 deprecated items, zero consumers.**

#### Orphaned Files
| File | Status |
|------|--------|
| `src/lib/ai/proactive-greeting.ts` | Never imported by anything |
| `src/lib/insights/deprecated-engine.ts` | Re-exported but never consumed |
| `src/lib/insights/insight-engine.ts` | Only re-exports deprecated-engine, unused |
| `src/components/canvas/renderers/index.ts` | Entire barrel file unused — duplicate of component-registry.ts |
| `src/lib/templates/conditions.ts` | Re-exported via barrel, never consumed |
| `src/lib/templates/state.ts` | Same |
| `src/lib/templates/selection.ts` | Same |
| `src/lib/user.ts` | `getCurrentUserId()` never imported (audit-log.ts has its own) |

#### Unused Store Actions (16+)
| Slice | Actions |
|-------|---------|
| UndoSlice | `setPolicies`, `addPolicy`, `removePolicy`, `placeRetentionHold`, `removeRetentionHold`, `pruneOldEntries`, `getEntriesBySource`, `getEntriesByBatch`, `clearHistory` |
| WorkspaceSlice | `activateTrigger`, `cleanupStaleSpaces`, `updateTransform`, `deleteTransform` |
| DataSlice | `invalidateCache`, `_setCacheEntry`, `_setComponentDataState` |
| ChatSlice | `setMessages`, `setError`, `clearMessages`, `updateToolCallResult` |
| NotificationSlice | `clearExpired`, `setPollingInterval` |

#### Unused Types in types/index.ts (~30+)
The entire event system (lines 836-902), auto-placement engine (305-333),
component registry interface (495-510), data source interface (388-420),
and user action types have zero runtime consumers.

#### Unused Hooks
`useComponentsByType`, `useViews`, `useIsSelected`, `useIsLoading`, `useTheme`

#### Duplicate Component Registry
- `src/lib/component-registry.ts` — the one actually used (complete)
- `src/components/canvas/renderers/index.ts` — unused, incomplete (missing Vercel renderers)

### P2 — API Bugs (R4)

| # | Route | Issue |
|---|-------|-------|
| 7 | `/api/slack` | `fetchMentions` uses `SLACK_BOT_TOKEN` but `search.messages` requires a user token (`xoxp-`). `SLACK_USER_TOKEN` is detected in `/api/integrations` but never used. |
| 8 | `/api/insights` | Missing `OPENAI_API_KEY` validation — crashes with opaque SDK error if key absent. |
| 9 | `/api/github` | Silently falls back to unauthenticated (60 req/hr) if `GITHUB_TOKEN` missing. No warning. |
| 10 | `/api/vercel` | Proceeds without project filter if `VERCEL_PROJECT_ID` missing — may return cross-project data. |

### P3 — Known Stubs
| File | Issue |
|------|-------|
| `src/lib/user.ts` | 3 TODOs — auth fully stubbed, returns `"default_user"` everywhere |

---

## Shape A: "Clean Sweep"

Fix everything in one pass, organized by blast radius.

### Slice 1: Fix Build (P0)
- Make `result` optional in `AddComponentToolUI` and `AddFilteredComponentToolUI` props
- Add `ComponentInstance` import to `execute-command.ts`
- **Demo:** `pnpm build` succeeds

### Slice 2: Fix Type Safety (P1)
- Add missing slices to `TestStore` in all 3 test files
- **Demo:** `tsc --noEmit` passes cleanly

### Slice 3: Remove Deprecated View Aliases (P2)
- Delete all `*View*` methods from `workspace-slice.ts`
- Delete `useViews()` and view aliases from `hooks/index.ts`
- Delete deprecated type aliases from `types/index.ts`
- Delete deprecated fields from `undo-slice.ts` and `undo/types.ts`
- **Demo:** `grep -r "View" src/` returns zero deprecated hits

### Slice 4: Remove Dead Code (P2)
- Delete orphaned files (proactive-greeting.ts, deprecated-engine.ts chain, renderers/index.ts)
- Remove unused store actions
- Remove unused hooks
- Remove unused type definitions (event system, placement engine, etc.)
- Remove duplicate component registry
- **Demo:** `tsc --noEmit` still passes, tests still pass, bundle size decreases

### Slice 5: Fix API Routes (P2)
- Use `SLACK_USER_TOKEN` for `search.messages` in Slack route
- Add `OPENAI_API_KEY` validation in insights route
- Add warning when `GITHUB_TOKEN` is missing
- Add warning when `VERCEL_PROJECT_ID` is missing
- **Demo:** API routes return clear error messages when env vars are missing

### Slice 6: Final Verification
- Full build passes
- All tests pass
- `tsc --noEmit` clean
- No deprecated/dead code remains
- Update CLAUDE.md to remove references to deleted patterns

---

## Fit Check: R × A

| Req | Shape A | Status |
|-----|---------|--------|
| R1: Build passes | Slice 1 fixes both TS errors | PASS |
| R2: Type checking passes | Slice 1 + Slice 2 | PASS |
| R3: No dead code | Slices 3 + 4 | PASS |
| R4: API routes correct | Slice 5 | PASS |
| R5: Tests type-safe | Slice 2 | PASS |
| R6: No orphaned design artifacts | Slice 4 | PASS |

**All requirements pass. No unknowns to spike.**

---

## Appetite

**Small batch — 1 session.** This is pure cleanup with no design decisions.
Every change is mechanical: delete, fix prop types, add imports, add validation.

## Risk

**Low.** Every slice has a concrete verification step. Nothing touches business
logic or user-facing behavior. The biggest risk is accidentally removing something
that IS used — mitigated by running build + tests after each slice.
