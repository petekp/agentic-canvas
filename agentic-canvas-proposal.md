# Agentic Canvas: Technical Proposal

**Version:** 0.1 Draft (Revised)
**Date:** January 2026
**Authors:** assistant-ui team
**Status:** Ready for Review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Prototype Truth (v0.1 Scope)](#prototype-truth-v01-scope)
3. [Problem Statement](#problem-statement)
4. [Product Vision](#product-vision)
5. [User Experience](#user-experience)
6. [Technical Architecture](#technical-architecture)
7. [Core Entities](#core-entities)
8. [Component Awareness System](#component-awareness-system)
9. [Undo/Redo Architecture](#undoredo-architecture)
10. [Data Layer](#data-layer)
11. [AI Integration](#ai-integration)
12. [Implementation Phases](#implementation-phases)
13. [Open Questions (v0.1)](#open-questions-v01)
14. [Risks & Considerations](#risks--considerations)
15. [Appendix: Context](#appendix-context)

---

## Executive Summary

We propose building an **Agentic Canvas** -- a new interface that combines conversational AI with a dynamic, generative workspace. The canvas displays AI-generated components (dashboards, widgets, data views) that are contextually aware of the user's tasks, time, and information sources.

**Key characteristics:**
- Part chat interface (assistant-ui), part spatial canvas
- Components are generated and configured by AI based on natural language requests
- Grid-based layout (no infinite canvas)
- Time- and context-aware by design
- Undo/redo from the start
- Views can be saved, remixed, and shared

**Initial use case:** Internal dogfooding -- helping the assistant-ui team keep up with GitHub issues and PRs across their repositories.

**Strategic context:** This prototype serves as the foundation for a bottom-up enterprise product (AI workspace infrastructure), leveraging our existing assets (assistant-ui, tool-ui, MCP integrations).

---

## Prototype Truth (v0.1 Scope)

This prototype is about **experiencing** the future, not fully implementing it.

**Simulated in v0.1 (experience-first):**
- Generative behavior (component creation/modification)
- Personalization and contextual dynamics
- Proactive layouts and time-aware behaviors

**Real in v0.1 (implemented):**
- Canvas + assistant layout
- Undo/redo architecture
- Assistant-cloud persistence for the thread
- Mock GitHub data feeding UI components
- Real MCP server using MCP Apps SDK to deliver sandboxed UI elements

**Out of scope for v0.1:**
- True learning systems or behavioral modeling
- Full connector ecosystem (only mock GitHub)
- Full component library or user-extensible registry

---

## Problem Statement

### The Pain
Knowledge workers using AI today face fragmented experiences:
- Conversations with AI are ephemeral and siloed
- Context must be manually re-established each session
- AI outputs are text-heavy; no persistent visual artifacts
- No shared understanding across team members
- Tools and data sources are disconnected

### The Opportunity
What if AI could:
- Understand your information landscape (GitHub, calendar, Slack, etc.)
- Generate custom UI on the fly based on what you need
- Remember and adapt to your workflows
- Surface the right information at the right time
- Create shareable, remixable views

### Why Us
assistant-ui has built:
- **assistant-ui**: The most popular React library for AI chat interfaces
- **tool-ui**: Specialized components for AI interfaces
- **MCP integrations**: Model Context Protocol support for connecting to external tools
- **Human-in-the-loop patterns**: Approval workflows for agentic actions

We're uniquely positioned to build the interface layer for agentic AI workspaces.

---

## Product Vision

### The Agentic Canvas

A **mercurial workspace** that:
1. **Converses** -- Natural language (text and voice) as primary input
2. **Generates** -- AI creates and configures UI components on the fly
3. **Adapts** -- Layout and content respond to context (time, task, behavior)
4. **Connects** -- Pulls from your information sources via MCP
5. **Remembers** -- Saves views, learns preferences, maintains continuity

### Core Principles

| Principle | Implication |
|-----------|-------------|
| **Conversation-first** | Chat is the primary interface; canvas is the output |
| **Grid-based simplicity** | No infinite canvas or pan/zoom; cognitive load matters |
| **Generative, not template** | AI creates components, not just fills templates |
| **Context-aware** | Time, task, and behavioral awareness built in |
| **Tolerance principle** | Undo/redo everywhere; safe to experiment |
| **Dogfood-first** | Build for ourselves; quality through daily use |
| **Shared authority** | Assistant and user can inspect/modify the same canvas |

---

## User Experience

### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AGENTIC CANVAS                                │
├─────────────────────────────────────────────────┬───────────────────────┤
│                                                 │                       │
│                 CANVAS (~75%)                   │   ASSISTANT (~25%)    │
│                                                 │                       │
│  ┌─────────────┐  ┌─────────────────────────┐  │   Conversational      │
│  │             │  │                         │  │   interface           │
│  │  Component  │  │      Component          │  │                       │
│  │             │  │                         │  │   - Text input        │
│  └─────────────┘  └─────────────────────────┘  │   - Voice input (opt)  │
│                                                 │   - Context display   │
│  ┌──────────────────────────────────────────┐  │   - Action history    │
│  │                                          │  │                       │
│  │           Component                      │  │                       │
│  │                                          │  │                       │
│  └──────────────────────────────────────────┘  │                       │
│                                                 │                       │
│  Components:                                   │                       │
│  - Generated by AI                             │                       │
│  - Draggable, resizable                        │                       │
│  - Dismissable, pinnable                       │                       │
│  - Snap to grid                                │                       │
│                                                 │                       │
└─────────────────────────────────────────────────┴───────────────────────┘
```

### Interaction Patterns

**1. User → Assistant → Canvas**
```
User: "Show me what PRs need my review"
Assistant: "You have 3 PRs waiting for review. I've added them to your canvas."
[PR List component appears on canvas]
```

**2. User → Assistant → Modify Canvas**
```
User: "Make that bigger and add a timeline of recent merges"
Assistant: "Done. I've expanded the PR list and added a merge timeline."
[PR List resizes; Timeline component appears]
```

**3. Canvas → Assistant**
```
[User clicks on Issue #108 in a component]
Assistant: "Issue #108 is a bug in the MCP runtime. It's blocking the v0.9
release. Would you like me to summarize the discussion or draft a response?"
```

**4. Proactive (Time-Aware)**
```
[9:00 AM Monday]
[Canvas automatically shows weekly review layout]
Assistant: "Good morning. Here's your week ahead -- 4 PRs to review,
the v0.9 milestone is at 67%. Your standup is in 30 minutes."
```

### Proactive UX as the Core Experiment

The prototype's main objective is to make proactive UI feel helpful, not disorienting.
We should validate:
- Can the assistant propose helpful canvas changes without overwhelming the user?
- Do users understand why the canvas changed?
- Can the user override and refine the proactive layout quickly?

### Voice Input

assistant-ui provides voice input out of the box. If it is tricky, we will punt and use
text input only for v0.1.

---

## Technical Architecture

### Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | React 18+ | Same as assistant-ui |
| Language | TypeScript | Strict mode |
| State | Zustand | With middleware for history |
| Styling | Tailwind CSS | Same as assistant-ui/tool-ui |
| Components | ad-hoc for prototype | No full component library in v0.1 |
| AI Runtime | assistant-ui | Chat interface, streaming, tool calls |
| UI Delivery | MCP Apps SDK | Sandboxed UI elements |
| Persistence | Assistant Cloud | Thread persistence |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────┐  ┌─────────────────────────────┐ │
│   │          Canvas View            │  │      Assistant View         │ │
│   │  - Grid layout                  │  │  - Chat interface           │ │
│   │  - Component rendering          │  │  - Voice input (optional)   │ │
│   │  - Drag/resize interactions     │  │  - assistant-ui primitives  │ │
│   └─────────────────────────────────┘  └─────────────────────────────┘ │
│                         │                           │                   │
│                         └─────────────┬─────────────┘                   │
│                                       │                                 │
│                                       ▼                                 │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                        WORKSPACE STORE                          │  │
│   │  - Canvas state (components, positions)                         │  │
│   │  - Thread state (assistant-cloud)                               │  │
│   │  - History state (undo/redo)                                    │  │
│   │  - View state (saved layouts)                                   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                       │                                 │
└───────────────────────────────────────┼─────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
            │  Component   │   │     AI       │   │    MCP       │
            │  Registry*   │   │  Reasoning   │   │ Apps Server  │
            │ (stubbed)    │   │              │   │ (sandbox UI) │
            └──────────────┘   └──────────────┘   └──────────────┘
```

*Registry is a minimal scaffold in v0.1, not a full library.

---

## Core Entities

We keep the entity model minimal while preserving the interfaces needed for future growth.

```typescript
interface Workspace {
  id: string;
  name: string;
  canvas: Canvas;
  threadId: string; // assistant-cloud
  views: View[];
  settings: WorkspaceSettings;
}

interface WorkspaceSettings {
  theme: "light" | "dark" | "system";
  voiceEnabled: boolean;
  defaultRefreshInterval: number;
  grid: GridConfig;
}

interface Canvas {
  grid: GridConfig;
  components: ComponentInstance[];
}

interface GridConfig {
  columns: number;  // e.g., 12
  rows: number;     // e.g., 8
  gap: number;      // pixels between cells
}

interface ComponentInstance {
  id: string;
  typeId: string;
  position: Position;
  size: Size;
  config: Record<string, unknown>;
  dataBinding: DataBinding | null;
  state: ComponentState;
  meta: ComponentMeta;
}

interface DataBinding {
  source: "mock-github"; // v0.1 only
  query: {
    type: string;
    params: Record<string, unknown>;
  };
  refreshInterval: number | null;
}
```

---

## Component Awareness System

### The Problem

The assistant must understand what's on the canvas to:
- Reference existing components
- Decide whether to create new vs. modify existing
- Avoid redundant information
- Maintain conversational continuity

### The v0.1 Approach (Heuristic Stubs)

We stub the awareness system with minimal heuristics and keep the interfaces stable.

```typescript
interface CanvasAwareness {
  components: ComponentAwareness[];
  temporal: TemporalAwareness;
  workspace: WorkspaceAwareness;
}

interface ComponentAwareness {
  id: string;
  type: string;
  position: { col: number; row: number };
  size: { cols: number; rows: number };
  summary: string;        // Natural language, <50 words
  highlights?: string[];  // Key data points
  actions?: string[];     // Available interactions
}
```

### Awareness Budget

We keep a token budget abstraction even if v0.1 uses heuristics. This allows us to
simulate context constraints and validate UX decisions.

---

## Undo/Redo Architecture

Undo/redo is a first-class requirement from day one.

```typescript
type CanvasAction =
  | { type: "component/add"; component: ComponentInstance }
  | { type: "component/remove"; componentId: string; component: ComponentInstance }
  | { type: "component/update"; componentId: string; before: Partial<ComponentInstance>; after: Partial<ComponentInstance> }
  | { type: "component/move"; componentId: string; from: Position; to: Position }
  | { type: "component/resize"; componentId: string; from: Size; to: Size }
  | { type: "view/load"; fromComponents: ComponentInstance[]; toComponents: ComponentInstance[] }
  | { type: "batch"; actions: CanvasAction[] };
```

---

## Data Layer

### v0.1: Simple + Mocked

- In-memory store with Zustand
- Mock GitHub data for components
- Assistant Cloud for thread persistence
- No real external connectors in v0.1

---

## AI Integration

### Generation Flow (v0.1)

- Build awareness context (stubbed)
- LLM or scripted generator returns `GenerationResult`
- Apply to canvas, record undo actions

```typescript
interface GenerationResult {
  create: {
    typeId: string;
    config: Record<string, unknown>;
    dataBinding: DataBinding;
    suggestedPosition?: Position;
    suggestedSize?: Size;
  }[];

  modify: {
    componentId: string;
    updates: Partial<ComponentInstance>;
  }[];

  remove: string[];
  message: string;
}
```

We may start with scripted outputs and progressively move toward real LLM generation
without changing the external interfaces.

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Canvas shell with manual component placement

- [ ] Workspace store (Zustand)
- [ ] Grid-based canvas renderer
- [ ] 3-4 hardcoded component types (PRList, IssueGrid, StatTile)
- [ ] Manual add/remove/move/resize
- [ ] Basic undo/redo

**Outcome:** Can manually place mock GitHub components on a grid

---

### Phase 2: Assistant Integration + Proactive Simulation (Weeks 3-4)

**Goal:** Assistant can create/modify canvas + test proactive UX

- [ ] assistant-ui chat panel integration
- [ ] Awareness system scaffolding (heuristic summaries)
- [ ] AI generation flow (scripted + LLM-ready interface)
- [ ] Proactive layout simulation (time-based scenarios)

**Outcome:** Can say "show me my PRs" and see components appear;
proactive layouts feel coherent and understandable.

---

### Phase 3: MCP Apps UI + Mock Data Integration (Week 5)

**Goal:** Real MCP server delivering sandboxed UI elements

- [ ] MCP Apps SDK server
- [ ] Mock GitHub data bindings
- [ ] Data refresh + loading/error states

**Outcome:** Sandboxed UI components render with realistic data flows

---

### Phase 4: Views & Polish (Week 6)

**Goal:** Save, load, and share views

- [ ] Save current canvas as View
- [ ] Load views
- [ ] View context (time-based triggers)
- [ ] UI polish, animations

**Outcome:** Usable daily driver for the team

---

## Open Questions (v0.1)

1. **Grid resolution** -- 12x8 or 16x10? We need enough flexibility without density overload.
2. **Proactive cadence** -- How often can the canvas change before it feels disorienting?
3. **Action granularity** -- Is batch undo/redo sufficient early on?
4. **View triggers** -- What minimal triggers should we support (time-of-day vs. day-of-week)?

---

## Risks & Considerations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context window explosion | Medium | High | Awareness budget, summarization stubs |
| AI generation unreliable | Medium | High | Scripted outputs + user correction |
| Performance with many components | Low | Medium | Limit component count |
| Complex state management | Medium | Medium | Start simple, add complexity gradually |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Proactive UI feels disorienting | Medium | High | Iterative testing + clear explanations |
| Simulation gap vs real feasibility | Medium | Medium | Preserve interfaces; mark assumptions |
| Scope creep | High | Medium | Strict phase gating |

---

## Appendix: Context

assistant-ui has strong open-source distribution and existing assets (assistant-ui, tool-ui,
MCP integrations, Assistant Cloud). This prototype is the foundation for a future enterprise
product, but **v0.1 is intentionally scoped to validate the experience** rather than deliver
full infrastructure.

*End of Proposal*
