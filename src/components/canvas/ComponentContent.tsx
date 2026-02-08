"use client";

// Component content renderer - renders the interior of a canvas component
// Positioning is handled by react-grid-layout, this just handles content
// Uses component-registry.ts for lazy-loaded renderers (code-splitting)

import { useCallback, Suspense } from "react";
import { useCanvas, useComponentData } from "@/hooks";
import type { ComponentInstance, DataLoadingState } from "@/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, X, Loader2 } from "lucide-react";

// Import registry for dynamic renderer lookup
import { CONTENT_RENDERERS } from "@/lib/component-registry";

// Import shared utilities and loading states from renderers
import { LoadingState, ErrorState, IdleState } from "./renderers/shared";

// ============================================================================
// Type Definitions
// ============================================================================

interface ComponentContentProps {
  component: ComponentInstance;
  isSelected?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Formats a type ID for display (e.g., "github.pr-list" -> "Pr List")
 */
function formatTypeId(typeId: string): string {
  const lastSegment = typeId.split(".").pop() ?? typeId;
  return lastSegment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

// ============================================================================
// Sub-Components: Header
// ============================================================================

interface ComponentHeaderProps {
  typeId: string;
  onRefresh: () => void;
  onRemove: () => void;
}

function ComponentHeader({ typeId, onRefresh, onRemove }: ComponentHeaderProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-10 drag-handle flex items-center justify-between px-3 py-2 bg-gradient-to-b from-zinc-900/90 via-zinc-900/60 to-transparent opacity-0 group-hover/component:opacity-100 pointer-events-none group-hover/component:pointer-events-auto cursor-move transition-opacity duration-150">
      <span className="text-sm font-medium truncate text-foreground/90">
        {formatTypeId(typeId)}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onRemove}
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Suspense Fallback
// ============================================================================

function RendererFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

// ============================================================================
// Data Content Router using Registry
// ============================================================================

interface DataContentProps {
  typeId: string;
  config: Record<string, unknown>;
  data: unknown;
  label?: string;
  componentId: string;
}

/**
 * Fallback renderer for unknown component types
 */
function FallbackRenderer({ data }: { data: unknown }) {
  return (
    <pre className="text-xs overflow-auto whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

/**
 * Routes to the appropriate renderer based on typeId
 * Uses lazy-loaded components from the registry for code-splitting
 */
function DataContent({
  typeId,
  config,
  data,
  label,
  componentId,
}: DataContentProps) {
  const Renderer = CONTENT_RENDERERS[typeId];

  if (!Renderer) {
    return <FallbackRenderer data={data} />;
  }

  // Build props based on what each renderer needs
  // The registry uses `any` typing, so we pass all available props
  // and let each renderer destructure what it needs
  const props = {
    config,
    data,
    label,
    componentId,
    repo: (config.repo as string) ?? "",
  };

  return (
    <Suspense fallback={<RendererFallback />}>
      <Renderer {...props} />
    </Suspense>
  );
}

// ============================================================================
// Content State Renderer
// ============================================================================

interface ContentStateProps {
  dataState: DataLoadingState;
  typeId: string;
  config: Record<string, unknown>;
  label?: string;
  componentId: string;
}

function ContentState({
  dataState,
  typeId,
  config,
  label,
  componentId,
}: ContentStateProps) {
  switch (dataState.status) {
    case "loading":
      return <LoadingState />;

    case "error":
      return <ErrorState message={dataState.error.message} />;

    case "idle":
      return <IdleState />;

    case "ready":
    case "stale":
      return (
        <DataContent
          typeId={typeId}
          config={config}
          data={dataState.data}
          label={label}
          componentId={componentId}
        />
      );

    default:
      return <IdleState />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function ComponentContent({
  component,
  isSelected,
}: ComponentContentProps) {
  const { removeComponent } = useCanvas();
  const { dataState, refresh } = useComponentData(component.id);

  const handleRemove = useCallback(() => {
    removeComponent(component.id);
  }, [component.id, removeComponent]);

  return (
    <div className="group/component relative h-full" data-selected={isSelected || undefined}>
      {/* Chrome overlay - appears on hover */}
      <ComponentHeader
        typeId={component.typeId}
        onRefresh={refresh}
        onRemove={handleRemove}
      />

      {/* Full-bleed content */}
      <div className="h-full p-3 overflow-auto">
        <ContentState
          dataState={dataState}
          typeId={component.typeId}
          config={component.config}
          label={component.meta.label}
          componentId={component.id}
        />
      </div>
    </div>
  );
}
