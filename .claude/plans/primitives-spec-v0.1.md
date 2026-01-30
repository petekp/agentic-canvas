# Agentic Canvas: Core Primitives Specification

<!--
  primitives-spec-v0.1.md

  The single source of truth for all TypeScript types in Agentic Canvas.

  When implementing, copy these interfaces directly—don't reinterpret.
  When the spec and code disagree, update one or the other; don't let them drift.

  Related docs:
  - component-schemas-v0.1.md  — Uses these types to define component configs
  - store-architecture-v0.1.md — Implements actions that operate on these types
  - ../agentic-canvas-proposal.md — Background context (this spec is authoritative)
-->

**Version:** 0.1.1
**Status:** Revised after review
**Last Updated:** January 2026

---

## Overview

This document defines the foundational primitives for Agentic Canvas—the type contracts, protocols, and interfaces that form the system's core architecture. These primitives are designed to be:

- **Type-safe**: Full TypeScript coverage with discriminated unions
- **Extensible**: Interfaces support future growth without breaking changes
- **Undo-friendly**: All mutations produce reversible actions
- **AI-compatible**: Structured for LLM tool calling and context awareness

### How to Use This Document

**Implementing types:** Copy interfaces into `src/types/`. Don't rename fields.

**Understanding commands:** Section 2 defines how mutations work. All canvas changes—whether from AI or user—flow through `CanvasCommand`.

**Building LLM tools:** Section 9 has the exact tool schemas for assistant-ui. The `config` param uses `oneOf` for per-component validation.

**Quick lookups:** Use the TOC. Types are grouped by concern (grid, components, data, etc.).

---

## Table of Contents

1. [Core Types](#1-core-types)
2. [Canvas Command Protocol](#2-canvas-command-protocol)
3. [User Action Protocol](#3-user-action-protocol)
4. [Component Registry Contract](#4-component-registry-contract)
5. [Data Binding Protocol](#5-data-binding-protocol)
6. [Canvas Context (Awareness)](#6-canvas-context-awareness)
7. [Canvas Event Protocol](#7-canvas-event-protocol)
8. [Proactive Trigger System](#8-proactive-trigger-system)
9. [LLM Tool Definitions](#9-llm-tool-definitions)
10. [Error Handling](#10-error-handling)

---

## 1. Core Types

### 1.1 Identifiers

```typescript
type WorkspaceId = string;     // "ws_abc123"
type ComponentId = string;     // "cmp_xyz789"
type ViewId = string;          // "view_def456"
type TypeId = string;          // "github.pr-list"
type DataSourceId = string;    // "mock-github"
type UndoId = string;          // "undo_ghi012"
type TriggerId = string;       // "trigger_jkl345"
```

### 1.2 Grid & Layout

```typescript
interface GridConfig {
  columns: number;    // e.g., 12
  rows: number;       // e.g., 8
  gap: number;        // pixels between cells
  cellWidth: number;  // computed from container
  cellHeight: number; // computed from container
}

interface Position {
  col: number;  // 0-indexed column
  row: number;  // 0-indexed row
}

interface Size {
  cols: number;  // width in grid units
  rows: number;  // height in grid units
}

interface Bounds {
  position: Position;
  size: Size;
}
```

### 1.3 Workspace & Canvas

```typescript
interface Workspace {
  id: WorkspaceId;
  name: string;
  canvas: Canvas;
  threadId: string;           // assistant-cloud thread
  views: View[];
  triggers: ProactiveTrigger[];
  settings: WorkspaceSettings;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceSettings {
  theme: "light" | "dark" | "system";
  voiceEnabled: boolean;
  defaultRefreshInterval: number;  // ms
  grid: GridConfig;
  proactiveMode: "suggest" | "auto" | "off";
}

interface Canvas {
  grid: GridConfig;           // Canvas-specific grid (inherits from workspace)
  components: ComponentInstance[];
}

interface View {
  id: ViewId;
  name: string;
  description?: string;
  snapshot: Canvas;           // Frozen canvas state
  triggerIds: TriggerId[];    // Associated triggers
  createdAt: number;
}
```

### 1.4 Component Instance

```typescript
interface ComponentInstance {
  id: ComponentId;
  typeId: TypeId;
  position: Position;
  size: Size;
  config: Record<string, unknown>;
  dataBinding: DataBinding | null;
  dataState: DataLoadingState;  // Renamed from 'state' for clarity
  meta: ComponentMeta;
}

interface ComponentMeta {
  createdAt: number;
  createdBy: "user" | "assistant";  // Inferred from command source
  pinned: boolean;            // Excluded from view.load and canvas.clear
  label?: string;             // User-provided label
}

// Renamed from DataLoadingState to clarify this tracks data fetching, not UI state
type DataLoadingState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "ready"; data: unknown; fetchedAt: number }
  | { status: "error"; error: DataError; attemptedAt: number }
  | { status: "stale"; data: unknown; fetchedAt: number };
```

---

## 2. Canvas Command Protocol

Commands represent AI-initiated mutations to the canvas. All commands are:
- **Immutable**: Describe intent, not mutation
- **Reversible**: Produce undo information
- **Batchable**: Can be grouped for atomic operations

### 2.1 Command Types

```typescript
type CanvasCommand =
  // Component Lifecycle
  | { type: "component.create"; payload: CreateComponentPayload }
  | { type: "component.update"; payload: UpdateComponentPayload }
  | { type: "component.remove"; payload: RemoveComponentPayload }

  // Component Layout
  | { type: "component.move"; payload: MoveComponentPayload }
  | { type: "component.resize"; payload: ResizeComponentPayload }

  // View Operations
  | { type: "view.save"; payload: SaveViewPayload }
  | { type: "view.load"; payload: LoadViewPayload }
  | { type: "view.delete"; payload: DeleteViewPayload }

  // Canvas Operations
  | { type: "canvas.clear"; payload: ClearCanvasPayload }

  // Batch (atomic multi-command)
  | { type: "batch"; payload: BatchPayload };
```

### 2.2 Command Payloads

```typescript
interface CreateComponentPayload {
  typeId: TypeId;
  config: Record<string, unknown>;
  dataBinding?: DataBinding;
  position?: Position;        // Optional: auto-place if omitted
  size?: Size;                // Optional: use component default
  meta?: Partial<ComponentMeta>;
}

interface UpdateComponentPayload {
  componentId: ComponentId;
  config?: Record<string, unknown>;
  dataBinding?: DataBinding | null;
  meta?: Partial<ComponentMeta>;
}

interface RemoveComponentPayload {
  componentId: ComponentId;
}

interface MoveComponentPayload {
  componentId: ComponentId;
  position: Position;
}

interface ResizeComponentPayload {
  componentId: ComponentId;
  size: Size;
}

interface SaveViewPayload {
  name: string;
  description?: string;
  triggerIds?: TriggerId[];
}

interface LoadViewPayload {
  viewId: ViewId;
}

interface DeleteViewPayload {
  viewId: ViewId;
}

interface ClearCanvasPayload {
  preservePinned: boolean;
}

interface BatchPayload {
  commands: CanvasCommand[];
  description: string;        // Human-readable summary
}
```

### 2.3 Command Results

```typescript
interface CommandResult {
  success: boolean;
  undoId: UndoId;
  explanation: string;        // Natural language for user
  affectedComponentIds: ComponentId[];
  error?: CommandError;
}

interface BatchCommandResult {
  success: boolean;
  undoId: UndoId;             // Single undo for entire batch
  explanation: string;
  results: CommandResult[];
  error?: CommandError;
}

interface CommandError {
  code: CommandErrorCode;
  message: string;
  componentId?: ComponentId;
}

type CommandErrorCode =
  | "COMPONENT_NOT_FOUND"
  | "INVALID_POSITION"
  | "INVALID_SIZE"
  | "TYPE_NOT_FOUND"
  | "CONFIG_VALIDATION_FAILED"
  | "VIEW_NOT_FOUND"
  | "COLLISION_DETECTED";
```

### 2.4 Undo/Redo State

The history system tracks all canvas mutations for undo/redo support.

```typescript
interface HistoryState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  maxSize: number;            // Max entries to retain (default: 50)
}

interface UndoEntry {
  id: UndoId;
  timestamp: number;
  source: "user" | "assistant";
  description: string;        // Human-readable: "Added PR List component"
  forward: CanvasCommand;     // Command that was executed
  inverse: CanvasCommand;     // Command to reverse it
}

// Undo/redo operations
type HistoryAction =
  | { type: "history.undo" }
  | { type: "history.redo" }
  | { type: "history.clear" };
```

### 2.5 Auto-Placement

When position is omitted from `CreateComponentPayload`, the layout engine determines placement.

```typescript
interface PlacementResult {
  position: Position;
  reason: PlacementReason;
  adjustments?: PlacementAdjustment[];
}

type PlacementReason =
  | "requested"       // User/AI specified exact position
  | "auto_placed"     // System found open space
  | "shifted"         // Existing components were moved to make room
  | "best_effort";    // Partial overlap, user should review

interface PlacementAdjustment {
  componentId: ComponentId;
  from: Position;
  to: Position;
  reason: string;
}

// Layout engine contract (implementation detail, interface for testing)
interface LayoutEngine {
  findPlacement(
    size: Size,
    canvas: Canvas,
    hints?: PlacementHints
  ): PlacementResult;

  detectCollisions(
    bounds: Bounds,
    canvas: Canvas,
    excludeId?: ComponentId
  ): ComponentId[];
}

interface PlacementHints {
  preferredPosition?: Position;
  nearComponentId?: ComponentId;  // Place near this component
  region?: "top" | "bottom" | "left" | "right";
}
```

---

## 3. User Action Protocol

User actions represent direct manipulation (drag, resize, dismiss). They use the same undo system but originate from UI, not assistant.

```typescript
type UserAction =
  | { type: "user.move"; componentId: ComponentId; position: Position }
  | { type: "user.resize"; componentId: ComponentId; size: Size }
  | { type: "user.dismiss"; componentId: ComponentId }
  | { type: "user.pin"; componentId: ComponentId; pinned: boolean }
  | { type: "user.refresh"; componentId: ComponentId }
  | { type: "user.undo" }
  | { type: "user.redo" };
```

---

## 4. Component Registry Contract

The registry defines what components exist, their configuration schemas, and rendering contracts.

### 4.1 Component Definition

```typescript
interface ComponentDefinition<TConfig = Record<string, unknown>> {
  // Identity
  typeId: TypeId;
  name: string;
  description: string;        // For AI context (<100 words)
  category: ComponentCategory;

  // Configuration
  configSchema: JSONSchema7;
  defaultConfig: Partial<TConfig>;

  // Layout
  defaultSize: Size;
  minSize: Size;
  maxSize: Size;

  // Data
  dataBindingSchema?: JSONSchema7;

  // Capabilities
  capabilities: ComponentCapability[];

  // Actions (for AI to suggest/invoke)
  actions: ComponentActionDefinition[];

  // Rendering
  render: React.ComponentType<ComponentRenderProps<TConfig>>;
}

type ComponentCategory =
  | "data"          // PRList, IssueGrid
  | "metric"        // StatTile, Chart
  | "timeline"      // Activity feed, history
  | "utility";      // Notes, links

type ComponentCapability =
  | "interactive"   // Has user interactions
  | "refreshable"   // Can poll for updates
  | "expandable"    // Has detail/modal view
  | "filterable"    // Supports filtering
  | "sortable"      // Supports sorting
  | "exportable";   // Can export data
```

### 4.2 Component Actions

```typescript
interface ComponentActionDefinition {
  actionId: string;
  label: string;
  description: string;        // For AI context
  icon?: string;              // Icon identifier
  requiresSelection?: boolean; // Needs selected item(s)
  params?: JSONSchema7;       // Action parameters
}
```

### 4.3 Render Props

```typescript
interface ComponentRenderProps<TConfig> {
  // Instance data
  instanceId: ComponentId;
  config: TConfig;
  size: Size;

  // Data state
  state: DataLoadingState;

  // Callbacks
  onAction: (actionId: string, params?: unknown) => void;
  onConfigChange: (config: Partial<TConfig>) => void;
  onSelect: (itemId: string, data: unknown) => void;
}
```

### 4.4 Registry Interface

```typescript
interface ComponentRegistry {
  // Registration
  register(definition: ComponentDefinition): void;
  unregister(typeId: TypeId): void;

  // Lookup
  get(typeId: TypeId): ComponentDefinition | undefined;
  getAll(): ComponentDefinition[];
  getByCategory(category: ComponentCategory): ComponentDefinition[];

  // Validation
  validateConfig(typeId: TypeId, config: unknown): ValidationResult;
  validateDataBinding(typeId: TypeId, binding: DataBinding): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

interface ValidationError {
  path: string;
  message: string;
  code: string;
}
```

---

## 5. Data Binding Protocol

How components declare data requirements and receive data.

### 5.1 Data Binding

```typescript
interface DataBinding {
  source: DataSourceId;
  query: DataQuery;
  refreshInterval: number | null;  // ms, null = manual only
}

interface DataQuery {
  type: string;                    // e.g., "pull_requests"
  params: Record<string, unknown>; // Query-specific params
}

// Note: DataTransform (client-side filter/sort/limit) deferred to v0.2.
// For v0.1, filtering is handled by query params or component render logic.
```

### 5.2 Data Source Contract

```typescript
interface DataSource {
  id: DataSourceId;
  name: string;
  description: string;

  // Supported queries
  queries: QueryDefinition[];

  // Execution
  execute(query: DataQuery): Promise<DataResult>;

  // Optional: real-time updates
  subscribe?(
    query: DataQuery,
    callback: (result: DataResult) => void
  ): Unsubscribe;
}

interface QueryDefinition {
  type: string;
  description: string;
  paramsSchema: JSONSchema7;
  resultSchema: JSONSchema7;
}

type Unsubscribe = () => void;
```

### 5.3 Data Results

```typescript
interface DataResult<T = unknown> {
  data: T;
  meta: DataMeta;
}

interface DataMeta {
  fetchedAt: number;
  source: DataSourceId;
  query: DataQuery;
  pagination?: PaginationMeta;
  stale: boolean;
  ttl: number;                   // Time-to-live in ms
}

interface PaginationMeta {
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
```

### 5.4 Data Errors

```typescript
interface DataError {
  code: DataErrorCode;
  message: string;
  source: DataSourceId;
  retryable: boolean;
  retryAfter?: number;           // ms
}

type DataErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "NETWORK"
  | "TIMEOUT"
  | "INVALID_QUERY"
  | "SOURCE_UNAVAILABLE"
  | "UNKNOWN";
```

---

## 6. Canvas Context (Awareness)

What the assistant sees about the current canvas state. Used for AI context injection.

### 6.1 Context Structure

```typescript
interface CanvasContext {
  // Component awareness
  components: ComponentSummary[];

  // Temporal awareness
  temporal: TemporalContext;

  // Workspace awareness
  workspace: WorkspaceContext;

  // Budget tracking
  budget: ContextBudget;
}
```

### 6.2 Component Summary

```typescript
interface ComponentSummary {
  id: ComponentId;
  typeId: TypeId;
  typeName: string;
  category: ComponentCategory;
  position: Position;
  size: Size;

  // Natural language summary (<50 words)
  summary: string;

  // Key data points for AI reasoning
  highlights: string[];

  // Available actions
  actions: string[];

  // Current state
  stateStatus: DataLoadingState["status"];
}
```

### 6.3 Temporal Context

```typescript
interface TemporalContext {
  timestamp: string;           // ISO 8601
  timezone: string;            // IANA timezone
  dayOfWeek: DayOfWeek;
  timeOfDay: TimeOfDay;
  isWorkHours: boolean;
}

type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type TimeOfDay = "early_morning" | "morning" | "mid_day" | "afternoon" | "evening" | "night";
```

### 6.4 Workspace Context

```typescript
interface WorkspaceContext {
  id: WorkspaceId;
  name: string;
  activeViewId: ViewId | null;
  savedViews: ViewSummary[];
  componentCount: number;
  gridUtilization: number;     // 0-1, how full is the canvas
}

interface ViewSummary {
  id: ViewId;
  name: string;
  description?: string;
  componentCount: number;
}
```

### 6.5 Context Budget

```typescript
interface ContextBudget {
  maxTokens: number;
  usedTokens: number;
  maxComponents: number;
  summarizationLevel: "full" | "condensed" | "minimal";
}
```

---

## 7. Canvas Event Protocol

Events flow from canvas to assistant when user interacts with components.

### 7.1 Event Types

```typescript
type CanvasEvent =
  // Component interactions
  | { type: "component.clicked"; payload: ComponentClickPayload }
  | { type: "component.action"; payload: ComponentActionPayload }
  | { type: "component.selected"; payload: ComponentSelectionPayload }

  // Component state changes
  | { type: "component.error"; payload: ComponentErrorPayload }
  | { type: "component.ready"; payload: ComponentReadyPayload }

  // Layout changes
  | { type: "layout.changed"; payload: LayoutChangePayload }

  // View changes
  | { type: "view.loaded"; payload: ViewLoadedPayload }

  // Trigger activations
  | { type: "trigger.activated"; payload: TriggerActivatedPayload };
```

### 7.2 Event Payloads

```typescript
interface ComponentClickPayload {
  componentId: ComponentId;
  elementId?: string;          // Specific element within component
  data?: unknown;              // Contextual data from component
}

interface ComponentActionPayload {
  componentId: ComponentId;
  actionId: string;
  params?: unknown;
  context?: unknown;           // Selection, filters, etc.
}

interface ComponentSelectionPayload {
  componentId: ComponentId;
  selectedItems: SelectedItem[];
}

interface SelectedItem {
  itemId: string;
  data: unknown;
}

interface ComponentErrorPayload {
  componentId: ComponentId;
  error: DataError;
}

interface ComponentReadyPayload {
  componentId: ComponentId;
  summary: string;             // Brief description of data
  highlights: string[];
}

interface LayoutChangePayload {
  componentId: ComponentId;
  changeType: "moved" | "resized" | "pinned" | "unpinned";
  newBounds: Bounds;
}

interface ViewLoadedPayload {
  viewId: ViewId;
  viewName: string;
}

interface TriggerActivatedPayload {
  triggerId: TriggerId;
  triggerName: string;
  suggestedViewId?: ViewId;
}
```

---

## 8. Proactive Trigger System

Triggers enable time- and event-based proactive behaviors.

> **v0.1 Scope:** Triggers are simulated/hardcoded in the prototype. This interface
> exists to preserve the contract for future implementation. Only `session_start`
> and `time_based` triggers are supported in v0.1.

### 8.1 Trigger Definition (Simplified for v0.1)

```typescript
interface ProactiveTrigger {
  id: TriggerId;
  name: string;
  description?: string;
  enabled: boolean;
  type: TriggerType;
  viewId?: ViewId;             // View to suggest/load
  message?: string;            // Message to show user
}

// v0.1: Only these two trigger types
type TriggerType =
  | "session_start"            // Fires when user opens workspace
  | "time_based";              // Simulated time triggers (e.g., "Monday 9am")

// v0.1: Time-based triggers are simulated with hardcoded scenarios
interface SimulatedTimeTrigger extends ProactiveTrigger {
  type: "time_based";
  simulatedTime: string;       // e.g., "monday_morning", "friday_afternoon"
}
```

### 8.2 Future Trigger Types (Deferred to v0.2+)

The following will be implemented post-prototype:
- Cron-based scheduling
- Data-condition triggers (e.g., "PR count > 5")
- Idle detection triggers
- Event-based triggers (external webhooks)

---

## 9. LLM Tool Definitions

Tool schemas for assistant-ui integration.

> **Note:** Component IDs are provided to the assistant via `CanvasContext` in the
> system prompt. The assistant does not need a separate tool to discover component IDs.

### 9.1 Create Component Tool

```typescript
const createComponentTool = {
  name: "create_component",
  description: "Add a new component to the canvas. Use this when the user asks to show, display, or add information.",
  parameters: {
    type: "object",
    properties: {
      type_id: {
        type: "string",
        enum: ["github.pr-list", "github.issue-grid", "github.stat-tile", "github.activity-timeline"],
        description: "The component type identifier",
      },
      config: {
        oneOf: [
          {
            // github.pr-list config
            type: "object",
            properties: {
              repo: { type: "string", description: "Repository in owner/repo format (required)" },
              state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
              limit: { type: "number", default: 10, minimum: 1, maximum: 50 },
            },
            required: ["repo"],
          },
          {
            // github.issue-grid config
            type: "object",
            properties: {
              repo: { type: "string", description: "Repository in owner/repo format (required)" },
              state: { type: "string", enum: ["open", "closed", "all"], default: "open" },
              labels: { type: "array", items: { type: "string" }, description: "Filter by labels" },
              limit: { type: "number", default: 20 },
            },
            required: ["repo"],
          },
          {
            // github.stat-tile config
            type: "object",
            properties: {
              repo: { type: "string", description: "Repository in owner/repo format (required)" },
              metric: {
                type: "string",
                enum: ["open_prs", "open_issues", "stars", "forks", "contributors"],
                description: "Which metric to display (required)"
              },
            },
            required: ["repo", "metric"],
          },
          {
            // github.activity-timeline config
            type: "object",
            properties: {
              repo: { type: "string", description: "Repository in owner/repo format (required)" },
              types: {
                type: "array",
                items: { type: "string", enum: ["push", "pr", "issue", "release", "comment"] },
                default: ["push", "pr", "issue"],
              },
              limit: { type: "number", default: 20 },
            },
            required: ["repo"],
          },
        ],
        description: "Component-specific configuration. Schema varies by type_id.",
      },
      position: {
        type: "object",
        properties: {
          col: { type: "number", minimum: 0, description: "Column position (0-indexed)" },
          row: { type: "number", minimum: 0, description: "Row position (0-indexed)" },
        },
        description: "Grid position. If omitted, component is auto-placed.",
      },
      size: {
        type: "object",
        properties: {
          cols: { type: "number", minimum: 1, description: "Width in grid units" },
          rows: { type: "number", minimum: 1, description: "Height in grid units" },
        },
        description: "Component size. If omitted, uses component default.",
      },
    },
    required: ["type_id", "config"],
  },
};
```

### 9.2 Modify Component Tool

```typescript
const modifyComponentTool = {
  name: "modify_component",
  description: "Update an existing component's configuration. Use component_id from canvas context.",
  parameters: {
    type: "object",
    properties: {
      component_id: {
        type: "string",
        description: "ID of the component to modify (from canvas context)",
      },
      config_updates: {
        type: "object",
        description: "Configuration fields to update (merged with existing config)",
      },
    },
    required: ["component_id"],
  },
};
```

### 9.3 Arrange Canvas Tool

```typescript
const arrangeCanvasTool = {
  name: "arrange_canvas",
  description: "Move or resize one or more components. Use for layout changes.",
  parameters: {
    type: "object",
    properties: {
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            component_id: { type: "string", description: "Component to move/resize" },
            position: {
              type: "object",
              properties: {
                col: { type: "number", minimum: 0 },
                row: { type: "number", minimum: 0 },
              },
              description: "New position (optional)",
            },
            size: {
              type: "object",
              properties: {
                cols: { type: "number", minimum: 1 },
                rows: { type: "number", minimum: 1 },
              },
              description: "New size (optional)",
            },
          },
          required: ["component_id"],
        },
        description: "List of move/resize operations (applied atomically)",
      },
    },
    required: ["operations"],
  },
};
```

### 9.4 Remove Component Tool

```typescript
const removeComponentTool = {
  name: "remove_component",
  description: "Remove a component from the canvas.",
  parameters: {
    type: "object",
    properties: {
      component_id: {
        type: "string",
        description: "ID of the component to remove (from canvas context)",
      },
    },
    required: ["component_id"],
  },
};
```

### 9.5 Refresh Component Tool

```typescript
const refreshComponentTool = {
  name: "refresh_component",
  description: "Trigger a data refresh for a component. Use when user asks to update or refresh data.",
  parameters: {
    type: "object",
    properties: {
      component_id: {
        type: "string",
        description: "ID of the component to refresh (from canvas context)",
      },
    },
    required: ["component_id"],
  },
};
```

### 9.6 Undo Tool

```typescript
const undoTool = {
  name: "undo",
  description: "Undo the last canvas change. Use when user asks to undo, revert, or go back.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "number",
        minimum: 1,
        maximum: 10,
        default: 1,
        description: "Number of steps to undo (default: 1)",
      },
    },
  },
};
```

### 9.7 Redo Tool

```typescript
const redoTool = {
  name: "redo",
  description: "Redo a previously undone canvas change.",
  parameters: {
    type: "object",
    properties: {
      steps: {
        type: "number",
        minimum: 1,
        maximum: 10,
        default: 1,
        description: "Number of steps to redo (default: 1)",
      },
    },
  },
};
```

### 9.8 Save View Tool

```typescript
const saveViewTool = {
  name: "save_view",
  description: "Save the current canvas layout as a named view for later use.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for the saved view",
      },
      description: {
        type: "string",
        description: "Optional description of what this view is for",
      },
    },
    required: ["name"],
  },
};
```

### 9.9 Load View Tool

```typescript
const loadViewTool = {
  name: "load_view",
  description: "Load a previously saved view, replacing current canvas. Pinned components are preserved.",
  parameters: {
    type: "object",
    properties: {
      view_id: {
        type: "string",
        description: "ID of the view to load (from workspace context)",
      },
    },
    required: ["view_id"],
  },
};
```

---

## 10. Error Handling

### 10.1 Error Hierarchy

```typescript
// Base error
interface AgenticCanvasError {
  code: string;
  message: string;
  timestamp: number;
  requestId?: string;
}

// Command execution errors
interface CommandExecutionError extends AgenticCanvasError {
  code: CommandErrorCode;
  command: CanvasCommand;
  componentId?: ComponentId;
}

// Data fetch errors
interface DataFetchError extends AgenticCanvasError {
  code: DataErrorCode;
  source: DataSourceId;
  query: DataQuery;
  retryable: boolean;
}

// Validation errors
interface ValidationFailedError extends AgenticCanvasError {
  code: "VALIDATION_FAILED";
  errors: ValidationError[];
}
```

### 10.2 Error Recovery (Deferred to v0.2)

For v0.1, errors are displayed to the user and the assistant explains them.
Structured error recovery with auto-recovery actions will be added post-prototype.

---

## Appendix A: v0.1 Component Types

For the prototype, we implement these component types:

| TypeId | Name | Category | Description |
|--------|------|----------|-------------|
| `github.pr-list` | PR List | data | List of pull requests with status, author, reviewers |
| `github.issue-grid` | Issue Grid | data | Grid of issues with labels, assignees, state |
| `github.stat-tile` | Stat Tile | metric | Single metric display (count, percentage) |
| `github.activity-timeline` | Activity Timeline | timeline | Chronological feed of repo activity |

---

## Appendix B: Mock GitHub Data Source

For v0.1, `mock-github` supports these query types:

| Query Type | Description | Params |
|------------|-------------|--------|
| `pull_requests` | List PRs | `repo`, `state`, `limit` |
| `issues` | List issues | `repo`, `state`, `labels`, `limit` |
| `stats` | Repository stats | `repo`, `metric` |
| `activity` | Recent activity | `repo`, `limit`, `types` |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | Jan 2026 | Initial draft |
| 0.1.1 | Jan 2026 | Post-review revisions: Added HistoryState/UndoEntry for undo/redo, PlacementResult for auto-layout, fixed Canvas.grid, renamed ComponentState→DataLoadingState, simplified ProactiveTrigger for v0.1, deferred DataTransform and ErrorRecovery, added component-specific config schemas to LLM tools, added refresh/undo/redo tools |
