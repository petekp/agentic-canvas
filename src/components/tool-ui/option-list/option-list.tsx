"use client";

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  Fragment,
} from "react";
import type { KeyboardEvent } from "react";
import type {
  OptionListProps,
  OptionListSelection,
  OptionListOption,
} from "./schema";
import { ActionButtons, normalizeActionsConfig } from "../shared";
import type { Action } from "../shared";
import { cn, Button, Separator } from "./_adapter";
import { Check } from "lucide-react";

function parseSelectionToIdSet(
  value: OptionListSelection | undefined,
  mode: "multi" | "single",
  maxSelections?: number,
): Set<string> {
  if (mode === "single") {
    const single =
      typeof value === "string"
        ? value
        : Array.isArray(value)
          ? value[0]
          : null;
    return single ? new Set([single]) : new Set();
  }

  const arr =
    typeof value === "string" ? [value] : Array.isArray(value) ? value : [];

  return new Set(maxSelections ? arr.slice(0, maxSelections) : arr);
}

function convertIdSetToSelection(
  selected: Set<string>,
  mode: "multi" | "single",
): OptionListSelection {
  if (mode === "single") {
    const [first] = selected;
    return first ?? null;
  }
  return Array.from(selected);
}

function areSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const val of a) {
    if (!b.has(val)) return false;
  }
  return true;
}

interface SelectionIndicatorProps {
  mode: "multi" | "single";
  isSelected: boolean;
  disabled?: boolean;
}

function SelectionIndicator({
  mode,
  isSelected,
  disabled,
}: SelectionIndicatorProps) {
  const shape = mode === "single" ? "rounded-full" : "rounded";

  return (
    <div
      className={cn(
        "flex size-4 shrink-0 items-center justify-center border-2 transition-colors",
        shape,
        isSelected && "border-primary bg-primary text-primary-foreground",
        !isSelected && "border-muted-foreground/50",
        disabled && "opacity-50",
      )}
    >
      {mode === "multi" && isSelected && <Check className="size-3" />}
      {mode === "single" && isSelected && (
        <span className="size-2 rounded-full bg-current" />
      )}
    </div>
  );
}

interface OptionItemProps {
  option: OptionListOption;
  isSelected: boolean;
  isDisabled: boolean;
  selectionMode: "multi" | "single";
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  tabIndex?: number;
  onFocus?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}

function OptionItem({
  option,
  isSelected,
  isDisabled,
  selectionMode,
  isFirst,
  isLast,
  onToggle,
  tabIndex,
  onFocus,
  buttonRef,
}: OptionItemProps) {
  const hasAdjacentOptions = !isFirst && !isLast;

  return (
    <Button
      ref={buttonRef}
      data-id={option.id}
      variant="ghost"
      size="lg"
      role="option"
      aria-selected={isSelected}
      onClick={onToggle}
      onFocus={onFocus}
      tabIndex={tabIndex}
      disabled={isDisabled}
      className={cn(
        "peer group relative h-auto min-h-[50px] w-full justify-start text-left text-sm font-medium",
        "rounded-none border-0 bg-transparent px-0 py-2 text-base shadow-none transition-none hover:bg-transparent! @md/option-list:text-sm",
        isFirst && "pb-2.5",
        hasAdjacentOptions && "py-2.5",
      )}
    >
      <span
        className={cn(
          "bg-primary/5 absolute inset-0 -mx-3 -my-0.5 rounded-xl opacity-0 transition-opacity group-hover:opacity-100",
        )}
      />
      <div className="relative flex items-start gap-3">
        <span className="flex h-6 items-center">
          <SelectionIndicator
            mode={selectionMode}
            isSelected={isSelected}
            disabled={option.disabled}
          />
        </span>
        {option.icon && (
          <span className="flex h-6 items-center">{option.icon}</span>
        )}
        <div className="flex flex-col text-left">
          <span className="leading-6 text-pretty">{option.label}</span>
          {option.description && (
            <span className="text-muted-foreground text-sm font-normal text-pretty">
              {option.description}
            </span>
          )}
        </div>
      </div>
    </Button>
  );
}

interface OptionListConfirmationProps {
  id: string;
  options: OptionListOption[];
  selectedIds: Set<string>;
  className?: string;
}

function OptionListConfirmation({
  id,
  options,
  selectedIds,
  className,
}: OptionListConfirmationProps) {
  const confirmedOptions = options.filter((opt) => selectedIds.has(opt.id));

  return (
    <div
      className={cn(
        "@container/option-list flex w-full max-w-md min-w-80 flex-col",
        "text-foreground",
        "motion-safe:animate-[fade-blur-in_300ms_cubic-bezier(0.16,1,0.3,1)_both]",
        className,
      )}
      data-slot="option-list"
      data-tool-ui-id={id}
      data-receipt="true"
      role="status"
      aria-label="Confirmed selection"
    >
      <div
        className={cn(
          "bg-card/60 flex w-full flex-col overflow-hidden rounded-2xl border px-5 py-2.5 shadow-xs",
        )}
      >
        {confirmedOptions.map((option, index) => (
          <Fragment key={option.id}>
            {index > 0 && <Separator orientation="horizontal" />}
            <div className="flex items-start gap-3 py-1">
              <span className="flex h-6 items-center">
                <Check className="text-primary size-4 shrink-0" />
              </span>
              {option.icon && (
                <span className="flex h-6 items-center">{option.icon}</span>
              )}
              <div className="flex flex-col text-left">
                <span className="text-base leading-6 font-medium text-pretty @md/option-list:text-sm">
                  {option.label}
                </span>
                {option.description && (
                  <span className="text-muted-foreground text-sm font-normal text-pretty">
                    {option.description}
                  </span>
                )}
              </div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function OptionList({
  id,
  role,
  receipt,
  options,
  selectionMode = "single",
  value,
  defaultValue,
  choice,
  responseActions,
  minSelections,
  maxSelections,
  onChange,
  onConfirm,
  onCancel,
  onResponseAction,
  onBeforeResponseAction,
  className,
}: OptionListProps) {
  const isControlled = value !== undefined;
  const initialSelection = parseSelectionToIdSet(
    isControlled ? value : defaultValue,
    selectionMode,
    maxSelections,
  );

  const [selectedIds, setSelectedIds] = useState(initialSelection);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const selectionRef = useRef(selectedIds);
  selectionRef.current = selectedIds;

  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!isControlled) return;
    const nextSelection = parseSelectionToIdSet(
      value,
      selectionMode,
      maxSelections,
    );
    if (!areSetsEqual(nextSelection, selectedIds)) {
      setSelectedIds(nextSelection);
    }
  }, [value, selectionMode, maxSelections, isControlled, selectedIds]);

  const updateSelection = useCallback(
    (nextSelection: Set<string>) => {
      if (isControlled) {
        onChange?.(convertIdSetToSelection(nextSelection, selectionMode));
        return;
      }

      setSelectedIds(nextSelection);
      onChange?.(convertIdSetToSelection(nextSelection, selectionMode));
    },
    [isControlled, onChange, selectionMode],
  );

  const handleToggle = useCallback(
    (option: OptionListOption) => {
      if (option.disabled) return;
      const nextSelection = new Set(selectedIds);

      if (selectionMode === "single") {
        if (nextSelection.has(option.id)) {
          nextSelection.clear();
        } else {
          nextSelection.clear();
          nextSelection.add(option.id);
        }
        updateSelection(nextSelection);
        return;
      }

      if (nextSelection.has(option.id)) {
        if (minSelections && nextSelection.size <= minSelections) return;
        nextSelection.delete(option.id);
      } else {
        if (maxSelections && nextSelection.size >= maxSelections) return;
        nextSelection.add(option.id);
      }

      updateSelection(nextSelection);
    },
    [selectedIds, selectionMode, minSelections, maxSelections, updateSelection],
  );

  const optionIndexById = useMemo(() => {
    return options.reduce<Record<string, number>>((acc, option, index) => {
      acc[option.id] = index;
      return acc;
    }, {});
  }, [options]);

  const orderedOptionIds = useMemo(() => options.map((option) => option.id), [
    options,
  ]);

  const focusOptionByIndex = useCallback(
    (index: number) => {
      const clampedIndex = Math.min(
        Math.max(index, 0),
        orderedOptionIds.length - 1,
      );
      const optionId = orderedOptionIds[clampedIndex];
      optionRefs.current[optionId]?.focus();
      setFocusedId(optionId);
    },
    [orderedOptionIds],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const activeId = focusedId ?? orderedOptionIds[0] ?? null;
      const activeIndex = activeId ? optionIndexById[activeId] : -1;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        focusOptionByIndex(activeIndex + 1);
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        focusOptionByIndex(activeIndex - 1);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusOptionByIndex(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusOptionByIndex(orderedOptionIds.length - 1);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) handleToggle(option);
      }
    },
    [
      focusedId,
      orderedOptionIds,
      optionIndexById,
      options,
      focusOptionByIndex,
      handleToggle,
    ],
  );

  const actionsConfig = useMemo(
    () => normalizeActionsConfig(responseActions),
    [responseActions],
  );
  const canConfirm = selectedIds.size >= (minSelections ?? 0);

  const confirmSelection = useCallback(async () => {
    if (!onConfirm) return;
    if (!canConfirm) return;
    setIsConfirming(true);
    try {
      await onConfirm(convertIdSetToSelection(selectedIds, selectionMode));
    } finally {
      setIsConfirming(false);
    }
  }, [onConfirm, canConfirm, selectedIds, selectionMode]);

  const handleResponseAction = useCallback(
    async (actionId: string) => {
      if (!onResponseAction) return;
      if (onBeforeResponseAction) {
        const allowed = await onBeforeResponseAction(actionId);
        if (!allowed) return;
      }
      await onResponseAction(actionId);
    },
    [onResponseAction, onBeforeResponseAction],
  );

  const combinedActions = useMemo(() => {
    const items: Action[] = [];
    if (onCancel) {
      items.push({
        id: "cancel",
        label: "Cancel",
        variant: "ghost",
      });
    }
    if (actionsConfig?.items) {
      items.push(...actionsConfig.items);
    }
    if (onConfirm) {
      items.push({
        id: "confirm",
        label: selectionMode === "single" ? "Confirm" : "Use selected",
        loading: isConfirming,
        disabled: !canConfirm,
      });
    }
    return items;
  }, [actionsConfig, onCancel, onConfirm, selectionMode, isConfirming, canConfirm]);

  const handleAction = useCallback(
    async (actionId: string) => {
      if (actionId === "confirm") {
        await confirmSelection();
        return;
      }
      if (actionId === "cancel") {
        onCancel?.();
        return;
      }
      await handleResponseAction(actionId);
    },
    [confirmSelection, onCancel, handleResponseAction],
  );

  if (choice !== undefined) {
    const selected = parseSelectionToIdSet(choice, selectionMode, maxSelections);
    return (
      <OptionListConfirmation
        id={id}
        options={options}
        selectedIds={selected}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "@container/option-list flex w-full max-w-md min-w-80 flex-col",
        "text-foreground",
        "motion-safe:animate-[fade-blur-in_300ms_cubic-bezier(0.16,1,0.3,1)_both]",
        className,
      )}
      data-slot="option-list"
      data-tool-ui-id={id}
      data-role={role}
      data-receipt={receipt?.outcome}
      role="listbox"
      aria-label="Options"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className={cn(
          "bg-card/60 flex w-full flex-col overflow-hidden rounded-2xl border px-5 py-2.5 shadow-xs",
        )}
      >
        {options.map((option, index) => {
          const isSelected = selectedIds.has(option.id);
          const isDisabled = Boolean(option.disabled);

          return (
            <Fragment key={option.id}>
              {index > 0 && <Separator orientation="horizontal" />}
              <OptionItem
                option={option}
                isSelected={isSelected}
                isDisabled={isDisabled}
                selectionMode={selectionMode}
                isFirst={index === 0}
                isLast={index === options.length - 1}
                onToggle={() => handleToggle(option)}
                tabIndex={focusedId === option.id || !focusedId ? 0 : -1}
                onFocus={() => setFocusedId(option.id)}
                buttonRef={(el) => {
                  optionRefs.current[option.id] = el;
                }}
              />
            </Fragment>
          );
        })}
      </div>

      {(onConfirm || onCancel || combinedActions.length > 0) && (
        <div
          className={cn(
            "@container/option-list flex w-full max-w-md min-w-80 flex-col gap-3",
            "pt-4",
          )}
        >
          <ActionButtons
            actions={combinedActions}
            onAction={handleAction}
            align={actionsConfig?.align}
            confirmTimeout={actionsConfig?.confirmTimeout}
          />
        </div>
      )}
    </div>
  );
}
