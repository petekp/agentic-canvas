# Snapshot-Based Undo/Redo System

## Problem

The current command-based undo/redo system has a critical ID mismatch bug:

```typescript
// When redoing component.create:
const componentId = `cmp_${nanoid(10)}`;  // NEW ID each time!
// Future undo/redo references the OLD ID = broken
```

This affects: redo after undo, batch restores (canvas.clear), view loading.

## Solution

Replace forward/inverse command pairs with before/after canvas snapshots.

**New UndoEntry structure:**
```typescript
interface CanvasSnapshot {
  components: ComponentInstance[];  // Deep copy
}

interface UndoEntry {
  id: UndoId;
  timestamp: number;
  source: "user" | "assistant";
  description: string;
  beforeSnapshot: CanvasSnapshot;  // State before action
  afterSnapshot: CanvasSnapshot;   // State after action
  viewContext: ViewId | null;
}
```

**Undo/Redo becomes trivial:**
- Undo: restore `beforeSnapshot.components`
- Redo: restore `afterSnapshot.components`

## Files to Modify

### 1. `src/types/index.ts`
- Add `CanvasSnapshot` interface
- Update `UndoEntry` (remove `forward`/`inverse`, add `beforeSnapshot`/`afterSnapshot`)

### 2. `src/store/history-slice.ts`
- Delete `executeCommandWithoutHistory()` (109 lines)
- Simplify `undo()`: restore beforeSnapshot, trigger data fetches
- Simplify `redo()`: restore afterSnapshot, trigger data fetches

### 3. `src/store/canvas-slice.ts`
Update 6 actions to capture snapshots:
- `addComponent()` - capture before/after
- `updateComponent()` - capture before/after
- `removeComponent()` - capture before/after
- `moveComponent()` - capture before/after
- `resizeComponent()` - capture before/after
- `clearCanvas()` - capture before/after

### 4. `src/store/workspace-slice.ts`
- `loadView()` - capture before/after snapshots

## Implementation Pattern

Each action follows this pattern:
```typescript
someAction: (payload) => {
  // 1. Capture BEFORE state
  const beforeSnapshot = { components: structuredClone(get().canvas.components) };

  // 2. Perform mutation
  set((state) => { /* mutate */ });

  // 3. Capture AFTER state
  const afterSnapshot = { components: structuredClone(get().canvas.components) };

  // 4. Create undo entry with snapshots
  const undoEntry: UndoEntry = {
    id: undoId,
    timestamp: Date.now(),
    source: "assistant",
    description: "...",
    beforeSnapshot,
    afterSnapshot,
    viewContext: get().activeViewId,
  };

  get()._pushUndo(undoEntry);
  get()._clearRedo();
}
```

## Key Design Decisions

1. **Use `structuredClone`** - Native, reliable, handles edge cases
2. **Full snapshots** (not diffs) - Simpler, bulletproof, ~1MB max memory
3. **Reset `dataState` to idle** on restore - Triggers fresh data fetch
4. **Keep `viewContext` separate** - Navigation state vs. canvas content

## Verification

After implementation, test these scenarios:

1. Add component → undo → redo (same ID preserved)
2. Remove component → undo → redo (original ID restored)
3. Move/resize → undo → redo (position/size correct)
4. Clear canvas → undo → redo (all components restored)
5. Load view → undo → redo (previous state + view navigation)
6. Multiple cycles: undo 5x → redo 5x (still works)
7. Data fetching: components with bindings fetch after restore
