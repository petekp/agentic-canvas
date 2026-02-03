# Component Architecture Refactoring Plan

Apply React Composition Patterns to improve extensibility and maintainability.

## Changes Overview

| Priority | Change | Files | Impact |
|----------|--------|-------|--------|
| HIGH | Component renderer registry | `lib/component-registry.ts` (new), `ComponentContent.tsx` | Extensibility |
| MEDIUM | Extract component types config | `lib/component-registry.ts`, `Canvas.tsx` | Separation of concerns |
| MEDIUM | Notification compound components | `notifications/` (new files) | Flexibility |
| MEDIUM | Composer action variants | `AssistantThread.tsx` | Explicitness |

---

## 1. Component Renderer Registry (HIGH)

**Problem:** `DataContent` switch statement with 13+ cases creates maintenance burden.

**Solution:** Create a registry that maps `typeId` → renderer component.

### New file: `src/lib/component-registry.ts`

```typescript
// Component type definitions for dropdown + defaults
export interface ComponentTypeConfig {
  typeId: string;
  label: string;
  category: "personal" | "github" | "posthog" | "slack";
  icon: LucideIcon;
  defaultConfig: Record<string, unknown>;
  defaultSize: { cols: number; rows: number };
  queryType: string;
  source?: string;
}

// Renderer registry
export const CONTENT_RENDERERS: Record<string, React.LazyExoticComponent<...>> = {
  "github.stat-tile": lazy(() => import("@/components/canvas/renderers/StatTileContent")),
  "github.pr-list": lazy(() => import("@/components/canvas/renderers/PRListContent")),
  // ... all renderers
};

// Component type configs (moved from Canvas.tsx)
export const COMPONENT_TYPES: ComponentTypeConfig[] = [
  { typeId: "github.stat-tile", label: "Stat Tile", category: "github", ... },
  // ... all types
];

// Helper to get types by category
export function getComponentTypesByCategory(category: string): ComponentTypeConfig[];
```

### Modify: `src/components/canvas/ComponentContent.tsx`

Replace switch statement:

```typescript
import { CONTENT_RENDERERS } from "@/lib/component-registry";

function DataContent({ typeId, ...props }: DataContentProps) {
  const Renderer = CONTENT_RENDERERS[typeId];

  if (!Renderer) {
    return <FallbackRenderer data={props.data} />;
  }

  return (
    <Suspense fallback={<RendererFallback />}>
      <Renderer {...props} />
    </Suspense>
  );
}
```

### Modify: `src/components/canvas/Canvas.tsx`

- Remove `componentTypes` array (move to registry)
- Import from `@/lib/component-registry`
- Simplify `AddComponentButton` to consume registry

---

## 2. Notification Compound Components (MEDIUM)

**Problem:** `NotificationItem` is monolithic, no customization path.

**Solution:** Create compound component pattern with context.

### New file: `src/components/notifications/NotificationContext.tsx`

```typescript
interface NotificationContextValue {
  notification: Notification;
  onAction: (action: NotificationAction) => void;
  onDismiss: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ notification, onAction, onDismiss, children }) {
  return (
    <NotificationContext value={{ notification, onAction, onDismiss }}>
      {children}
    </NotificationContext>
  );
}
```

### New file: `src/components/notifications/NotificationParts.tsx`

```typescript
// Compound components that consume context
export function NotificationRoot({ children, className }) { ... }
export function NotificationHeader({ children }) { ... }
export function NotificationTitle() { ... }  // Reads from context
export function NotificationMessage() { ... }
export function NotificationTimestamp() { ... }
export function NotificationDismiss() { ... }
export function NotificationActions() { ... }
export function NotificationPriorityIndicator() { ... }

// Namespace export
export const Notification = {
  Root: NotificationRoot,
  Header: NotificationHeader,
  Title: NotificationTitle,
  Message: NotificationMessage,
  Timestamp: NotificationTimestamp,
  Dismiss: NotificationDismiss,
  Actions: NotificationActions,
  Priority: NotificationPriorityIndicator,
};
```

### Modify: `src/components/notifications/NotificationPanel.tsx`

```typescript
// Replace inline NotificationItem with composed version
{notifications.map((n) => (
  <NotificationProvider
    key={n.id}
    notification={n}
    onAction={(action) => handleAction(n, action)}
    onDismiss={() => handleDismiss(n)}
  >
    <Notification.Root>
      <Notification.Priority />
      <Notification.Header>
        <Notification.Title />
        <Notification.Dismiss />
      </Notification.Header>
      <Notification.Message />
      <Notification.Timestamp />
      <Notification.Actions />
    </Notification.Root>
  </NotificationProvider>
))}
```

---

## 3. Composer Action Variants (MEDIUM)

**Problem:** Inline ternary in `Composer` mixes concerns.

**Solution:** Extract explicit action variants.

### Modify: `src/components/chat/AssistantThread.tsx`

```typescript
// Extract variants
function ComposerSendAction() {
  return (
    <ComposerPrimitive.Send className={cn(
      "p-2 rounded-lg shrink-0",
      "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
    )}>
      <SendHorizonal className="h-4 w-4" />
    </ComposerPrimitive.Send>
  );
}

function ComposerCancelAction() {
  return (
    <ComposerPrimitive.Cancel className={cn(
      "p-2 rounded-lg shrink-0",
      "bg-destructive text-destructive-foreground hover:bg-destructive/90"
    )}>
      <Square className="h-4 w-4" />
    </ComposerPrimitive.Cancel>
  );
}

// In Composer component
function Composer() {
  const isRunning = useAssistantState((s) => s.thread.isRunning);

  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 p-3 border-t border-border">
      <ComposerPrimitive.Input ... />
      {isRunning ? <ComposerCancelAction /> : <ComposerSendAction />}
    </ComposerPrimitive.Root>
  );
}
```

---

## Files to Create/Modify

### Create:
- `src/lib/component-registry.ts`
- `src/components/notifications/NotificationContext.tsx`
- `src/components/notifications/NotificationParts.tsx`

### Modify:
- `src/components/canvas/ComponentContent.tsx` - Use registry
- `src/components/canvas/Canvas.tsx` - Import from registry
- `src/components/notifications/NotificationPanel.tsx` - Use compound components
- `src/components/chat/AssistantThread.tsx` - Extract action variants

---

## Verification

1. **Build check:** `npm run build` passes
2. **Type check:** `npx tsc --noEmit` passes
3. **Visual verification:**
   - Canvas components render correctly
   - Add Component dropdown works
   - Notifications display and actions work
   - Chat composer send/cancel buttons work
4. **Extensibility test:** Adding a new component type requires only:
   - One entry in `CONTENT_RENDERERS`
   - One entry in `COMPONENT_TYPES`
