"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OptionList } from "./option-list";
import type { OptionListOption, OptionListSelection } from "./schema";

export type AsyncOptionListResult<TContext = unknown> = {
  options: OptionListOption[];
  context?: TContext;
  emptyMessage?: string;
};

export type AsyncOptionListConfirmResult = {
  success: boolean;
  error?: string;
  choice?: OptionListSelection;
};

export type AsyncOptionListProps<TContext = unknown> = {
  id: string;
  selectionMode?: "single" | "multi";
  minSelections?: number;
  maxSelections?: number;
  className?: string;
  loadingMessage?: string;
  emptyMessage?: string;
  loadOptions: () => Promise<AsyncOptionListResult<TContext>>;
  onConfirm: (
    selection: OptionListSelection,
    context?: TContext
  ) => Promise<AsyncOptionListConfirmResult>;
};

export function AsyncOptionList<TContext = unknown>({
  id,
  selectionMode = "single",
  minSelections = 1,
  maxSelections,
  className,
  loadingMessage = "Loading options...",
  emptyMessage = "No options available.",
  loadOptions,
  onConfirm,
}: AsyncOptionListProps<TContext>) {
  const [options, setOptions] = useState<OptionListOption[]>([]);
  const [context, setContext] = useState<TContext | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<OptionListSelection | undefined>(undefined);
  const [resolvedEmptyMessage, setResolvedEmptyMessage] = useState<string>(emptyMessage);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadOptions()
      .then((result) => {
        if (cancelled) return;
        setOptions(result.options);
        setContext(result.context);
        if (result.emptyMessage) {
          setResolvedEmptyMessage(result.emptyMessage);
        }
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load options");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadOptions]);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection) => {
      const result = await onConfirm(selection, context);
      if (result.success) {
        setChoice(result.choice ?? selection);
        setError(null);
      } else if (result.error) {
        setError(result.error);
      }
    },
    [onConfirm, context]
  );

  const normalizedOptions = useMemo(() => options.filter(Boolean), [options]);

  if (loading) {
    return <div className="text-[11px] text-muted-foreground">{loadingMessage}</div>;
  }

  if (error) {
    return <div className="text-[11px] text-red-600">{error}</div>;
  }

  if (normalizedOptions.length === 0) {
    return <div className="text-[11px] text-muted-foreground">{resolvedEmptyMessage}</div>;
  }

  return (
    <OptionList
      id={id}
      selectionMode={selectionMode}
      options={normalizedOptions}
      minSelections={minSelections}
      maxSelections={maxSelections}
      choice={choice}
      onConfirm={handleConfirm}
      className={className}
    />
  );
}
