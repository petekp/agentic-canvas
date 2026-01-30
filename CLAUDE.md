# Agentic Canvas

A conversational AI workspace that generates UI components on a grid-based canvas.

## Project Status

**Phase:** Pre-implementation (specs complete, no code yet)

## Quick Start for Agents

When working on this project, read specs in this order:

1. **Types first:** `.claude/plans/primitives-spec-v0.1.md`
   - All TypeScript interfaces live here
   - Commands, events, and protocols defined
   - This is the single source of truth for types

2. **Components second:** `.claude/plans/component-schemas-v0.1.md`
   - Config and data shapes for each component
   - Actions the assistant can take
   - Rendering guidance

3. **Store third:** `.claude/plans/store-architecture-v0.1.md`
   - Zustand slices and how they compose
   - Command → action → history flow
   - React hooks for consuming state

4. **Context last:** `agentic-canvas-proposal.md`
   - Product vision and rationale
   - Background only—specs override if they conflict

## Key Architecture Decisions

### Why Zustand over Redux?
Simpler API, built-in immer support, easier slice composition. This is a prototype—we can migrate later if needed.

### Why commands instead of direct mutations?
Every change goes through `CanvasCommand` so we can:
- Record undo/redo automatically
- Let AI and users share the same mutation path
- Validate before applying

### Why mock data instead of real GitHub API?
v0.1 is about validating the UX, not building connectors. Mock data lets us control scenarios and iterate fast.

### Why grid-based instead of infinite canvas?
Cognitive load. Fixed grids constrain layout decisions, making both user placement and AI suggestions simpler.

## Patterns to Follow

- **All state through store** — No component-local state for canvas data
- **Commands are immutable** — They describe intent, not mutation
- **Selectors for reads** — Use `shallow` equality to prevent re-renders
- **Computed at render** — Fields like `age` and `isStale` are derived, not stored
- **LLM tools use snake_case** — `add_component`, `move_component` (not camelCase)
- **Internal types use PascalCase** — `CanvasCommand`, `DataLoadingState`

## Patterns to Avoid

See `AGENT_CHANGELOG.md` > "Deprecated Patterns" for the full list. Key ones:

- Don't use `ComponentState` — it's now `DataLoadingState`
- Don't use `DataTransform` — deferred to v0.2
- Don't create complex triggers — only `session_start` and `time_based` in v0.1
- Don't implement `ErrorRecovery` — deferred to v0.2
- Don't create a `list_components` tool — inject IDs via `CanvasContext`

## File Structure (Planned)

```
src/
├── store/
│   ├── index.ts           # Combined store
│   ├── canvas-slice.ts
│   ├── history-slice.ts
│   ├── data-slice.ts
│   └── workspace-slice.ts
├── components/
│   ├── canvas/            # Grid and layout
│   └── widgets/           # PR list, issue grid, etc.
├── types/
│   └── index.ts           # All types from primitives spec
├── lib/
│   ├── registry.ts        # Component registry
│   ├── layout-engine.ts   # Auto-placement
│   └── mock-github.ts     # Mock data source
└── hooks/
    └── index.ts           # useCanvas, useHistory, etc.
```

## Implementation Notes

**Next step:** Scaffold Next.js + TypeScript project with these deps:
- `zustand`, `immer`, `nanoid` (state)
- `tailwindcss` (styling)
- `assistant-ui` (chat interface, future integration)

**Spec validation process:** Before implementing, have a subagent review specs for gaps. The v0.1.1 revision caught 20+ issues including missing undo state types and placement contracts.

## Running the Project

Not yet implemented. When ready:

```bash
npm install
npm run dev
```

## Testing

Not yet implemented. Plan to use:
- Vitest for unit tests
- React Testing Library for components
- Playwright for E2E
