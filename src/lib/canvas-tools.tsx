"use client";

// Canvas Tools - Client-side tool definitions using assistant-ui's makeAssistantTool
// Tools execute automatically when AI calls them, with proper undo batching

import { makeAssistantTool, tool, useAssistantState } from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { nanoid } from "nanoid";
import { useStore } from "@/store";
import { DEFAULT_BINDINGS, DEFAULT_SIZES, getDefaultBinding } from "@/lib/canvas-defaults";
import { serializeCanvasContext } from "@/lib/canvas-context";
import { addComponentWithFetch } from "@/lib/assistant-actions";
import { assertIntegrationAvailable } from "@/lib/integration-preflight";
import { resolveConfigFromChat } from "@/lib/tool-config";
import { inferSlackUserFromText } from "@/lib/component-config";
import { buildSlackMentionsFilterCode } from "@/lib/slack-mentions-filter";
import { applySlackMentionsChannelActivityDefaults } from "@/lib/slack-mentions-defaults";
import {
  formatAddFilteredComponentToolMessage,
  formatToolErrorMessage,
  isSlackChannelMissing,
} from "@/lib/tool-ui-messages";
import {
  compileTemplateToCommands,
  deriveIntent,
  getAllTemplates,
  getTemplate,
  registerDefaultTemplates,
  selectTopTemplate,
} from "@/lib/templates";
import { buildStateSnapshotFromSignals } from "@/lib/templates/state-signals";
import {
  executeCanvasCommand,
  summarizeGenerationResults,
  validateCanvasCommand,
} from "@/lib/templates/execution";
import type { AssistantCommandSource } from "@/lib/undo/types";
import type { CreateComponentPayload, UpdateComponentPayload, DataBinding } from "@/types";
import {
  AsyncOptionList,
  type OptionListSelection,
  type OptionListOption,
} from "@/components/tool-ui/option-list";
import {
  Check,
  Loader2,
  Plus,
  Trash2,
  Move,
  Maximize2,
  Settings,
  Eraser,
  LayoutGrid,
  ArrowRightLeft,
  Pin,
  PinOff,
  Sparkles,
  Filter,
  XCircle,
  Users,
} from "lucide-react";

// ============================================================================
// Shared Components
// ============================================================================

function ToolStatus({
  status,
  result,
  needsInput,
  resolved,
}: {
  status: { type: string };
  result?: unknown;
  needsInput?: boolean;
  resolved?: boolean;
}) {
  if (status.type === "running") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }
  if (resolved) {
    return <Check className="h-3 w-3 text-green-500" />;
  }
  if (needsInput) {
    return <Settings className="h-3 w-3 text-muted-foreground" />;
  }
  const errorMessage = formatToolErrorMessage(result);
  if (errorMessage) {
    return <XCircle className="h-3 w-3 text-red-500" />;
  }
  if (status.type === "complete") {
    return <Check className="h-3 w-3 text-green-500" />;
  }
  return null;
}

type SlackChannelListItem = {
  id: string;
  name: string;
  isMember: boolean;
  isPrivate: boolean;
};

type SlackUserListItem = {
  userId: string;
  username?: string;
  displayName?: string;
};

function shouldOfferSlackChannelPicker(
  typeId: string,
  result: unknown
): boolean {
  if (typeId !== "slack.channel-activity") return false;
  if (isSlackChannelMissing(result)) return true;
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.success !== false) return false;
  const candidates = [
    typeof record.error === "string" ? record.error : null,
    typeof record.action === "string" ? record.action : null,
    typeof record.assistantMessage === "string" ? record.assistantMessage : null,
  ].filter(Boolean) as string[];
  return candidates.some((value) =>
    /not a member|not_in_channel|channel not found|couldn't find/i.test(value)
  );
}

function shouldOfferSlackUserPicker(typeId: string, result: unknown): boolean {
  if (typeId !== "slack.mentions") return false;
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (!Array.isArray(record.userOptions)) return false;
  return record.userOptions.length > 0;
}

async function fetchSlackChannelList(): Promise<SlackChannelListItem[]> {
  const response = await fetch("/api/slack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "channel_list", params: {} }),
  });

  if (!response.ok) {
    const error = await response.json();
    const message = error?.error ?? `Slack API error: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function formatSlackChannelListError(error: string): string {
  if (/SLACK_BOT_TOKEN/i.test(error)) {
    return "Slack isn't connected yet. Connect Slack to list channels.";
  }
  return error;
}

async function fetchSlackUserLookup(query: string, limit = 10): Promise<SlackUserListItem[]> {
  const response = await fetch("/api/slack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user_lookup", params: { query, limit } }),
  });

  if (!response.ok) {
    const error = await response.json();
    const message = error?.error ?? `Slack API error: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchSlackUserList(limit = 30): Promise<SlackUserListItem[]> {
  const response = await fetch("/api/slack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user_list", params: { limit } }),
  });

  if (!response.ok) {
    const error = await response.json();
    const message = error?.error ?? `Slack API error: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function formatSlackUserListError(error: string): string {
  if (/users:read|missing_scope|not_allowed_token_type/i.test(error)) {
    return "Slack user lookup requires the users:read scope. Update the Slack connection to allow user lookup.";
  }
  if (/SLACK_BOT_TOKEN/i.test(error)) {
    return "Slack isn't connected yet. Connect Slack to list users.";
  }
  return error;
}

async function resolveSlackUserOptions(query?: string | null): Promise<{
  users: SlackUserListItem[];
  emptyMessage?: string;
}> {
  if (query) {
    const matches = await fetchSlackUserLookup(query);
    if (matches.length > 0) {
      return { users: matches };
    }
    const fallback = await fetchSlackUserList();
    return {
      users: fallback,
      emptyMessage: `No matches for "${query}". Choose a Slack user instead.`,
    };
  }

  return { users: await fetchSlackUserList() };
}

function SlackChannelPicker({
  id,
  selectionMode,
  allowAll,
  onConfirm,
}: {
  id: string;
  selectionMode: "single" | "multi";
  allowAll?: boolean;
  onConfirm: (selection: OptionListSelection, channels: SlackChannelListItem[]) => Promise<{ success: boolean; error?: string }>;
}) {
  const loadOptions = useCallback(async () => {
    try {
      const channels = await fetchSlackChannelList();
      const sortedChannels = [...channels]
        .filter((channel) => channel.isMember)
        .sort((a, b) => a.name.localeCompare(b.name));

      const channelOptions: OptionListOption[] = sortedChannels.map((channel) => {
        const label = `#${channel.name}`;
        const description = channel.isPrivate ? "Private channel" : "Public channel";
        return {
          id: channel.id,
          label,
          description,
        };
      });

      const availableCount = sortedChannels.length;
      if (selectionMode === "multi" && allowAll && availableCount > 0) {
        channelOptions.unshift({
          id: "__all_channels__",
          label: "All available channels",
          description: `${availableCount} channels`,
        });
      }

      if (channelOptions.length === 0) {
        return {
          options: [],
          context: [],
          emptyMessage: "No accessible Slack channels yet. Invite the Slack app to a channel (e.g. #general) and try again.",
        };
      }

      return {
        options: channelOptions,
        context: sortedChannels,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load channels";
      throw new Error(formatSlackChannelListError(message));
    }
  }, [selectionMode, allowAll]);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection, channels?: SlackChannelListItem[]) =>
      onConfirm(selection, channels ?? []),
    [onConfirm]
  );

  return (
    <AsyncOptionList
      id={id}
      selectionMode={selectionMode}
      minSelections={1}
      loadingMessage="Loading Slack channels..."
      emptyMessage="No Slack channels available."
      loadOptions={loadOptions}
      onConfirm={handleConfirm}
    />
  );
}

function SlackUserPicker({
  id,
  selectionMode = "single",
  query,
  preloadedUsers,
  onConfirm,
}: {
  id: string;
  selectionMode?: "single" | "multi";
  query?: string | null;
  preloadedUsers?: SlackUserListItem[];
  onConfirm: (selection: OptionListSelection, users: SlackUserListItem[]) => Promise<{ success: boolean; error?: string }>;
}) {
  const loadOptions = useCallback(async () => {
    try {
      if (preloadedUsers) {
        return {
          options: preloadedUsers.map((user) => {
            const label = user.displayName || user.username || user.userId;
            const details = [
              user.username ? `@${user.username}` : null,
              user.userId,
            ].filter(Boolean);
            return {
              id: user.userId,
              label,
              description: details.length > 0 ? details.join(" • ") : undefined,
            };
          }),
          context: preloadedUsers,
        };
      }

      const { users, emptyMessage } = await resolveSlackUserOptions(query);
      return {
        options: users.map((user) => {
          const label = user.displayName || user.username || user.userId;
          const details = [
            user.username ? `@${user.username}` : null,
            user.userId,
          ].filter(Boolean);
          return {
            id: user.userId,
            label,
            description: details.length > 0 ? details.join(" • ") : undefined,
          };
        }),
        context: users,
        emptyMessage,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      throw new Error(formatSlackUserListError(message));
    }
  }, [preloadedUsers, query]);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection, users?: SlackUserListItem[]) =>
      onConfirm(selection, users ?? []),
    [onConfirm]
  );

  return (
    <AsyncOptionList
      id={id}
      selectionMode={selectionMode}
      minSelections={1}
      loadingMessage="Loading Slack users..."
      emptyMessage="No Slack users available."
      loadOptions={loadOptions}
      onConfirm={handleConfirm}
    />
  );
}

function getTypeName(typeId: string): string {
  const names: Record<string, string> = {
    "github.stat-tile": "stat tile",
    "github.pr-list": "PR list",
    "github.issue-grid": "issue grid",
    "github.activity-timeline": "activity timeline",
    "github.my-activity": "my activity",
    "github.commits": "commits",
    "github.team-activity": "team activity",
    "posthog.site-health": "site health",
    "posthog.property-breakdown": "property breakdown",
    "posthog.top-pages": "top pages",
    "slack.channel-activity": "channel activity",
    "slack.mentions": "mentions",
    "slack.thread-watch": "thread watch",
  };
  if (!typeId) return "component";
  return names[typeId] ?? typeId.split(".").pop() ?? typeId;
}

function isMentionsIntent({
  filterName,
  filterDescription,
  filterCode,
}: {
  filterName?: string;
  filterDescription?: string;
  filterCode?: string;
}): boolean {
  const haystack = [filterName, filterDescription, filterCode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes("mention");
}

function applySlackMentionsDefaults(
  typeId: string,
  config: Record<string, unknown> | undefined,
  mentionIntent: boolean
): Record<string, unknown> | undefined {
  if (typeId !== "slack.channel-activity" || !mentionIntent) return config;
  return applySlackMentionsChannelActivityDefaults(config);
}

function resolveSelectedChannels(
  selection: OptionListSelection,
  channels: SlackChannelListItem[]
): SlackChannelListItem[] {
  if (!selection) return [];
  const selectedIds = Array.isArray(selection) ? selection : [selection];
  const includeAll = selectedIds.includes("__all_channels__");
  const available = channels.filter((channel) => channel.isMember);
  if (includeAll) return available;
  const selectedSet = new Set(selectedIds);
  return available.filter((channel) => selectedSet.has(channel.id));
}

function resolveSelectedUsers(
  selection: OptionListSelection,
  users: SlackUserListItem[]
): SlackUserListItem[] {
  if (!selection) return [];
  const selectedIds = Array.isArray(selection) ? selection : [selection];
  const selectedSet = new Set(selectedIds);
  return users.filter((user) => selectedSet.has(user.userId));
}

const SLACK_USER_ID_INPUT_REGEX = /^[UW][A-Z0-9]{8,}$/;

async function resolveSlackMentionsUser(
  config?: Record<string, unknown>
): Promise<{
  config?: Record<string, unknown>;
  userOptions?: SlackUserListItem[];
  userQuery?: string;
  error?: string;
}> {
  if (!config) return { config };
  const userId = typeof config.userId === "string" ? config.userId : null;
  if (userId) return { config };

  const rawQuery = typeof config.userQuery === "string" ? config.userQuery.trim() : "";
  if (!rawQuery) return { config };

  if (SLACK_USER_ID_INPUT_REGEX.test(rawQuery)) {
    return { config: { ...config, userId: rawQuery }, userQuery: rawQuery };
  }

  try {
    const matches = await fetchSlackUserLookup(rawQuery);
    if (matches.length === 1) {
      return { config: { ...config, userId: matches[0].userId }, userQuery: rawQuery };
    }
    if (matches.length > 1) {
      return {
        config,
        userOptions: matches,
        userQuery: rawQuery,
        error: `Which Slack user should I use for "${rawQuery}"?`,
      };
    }

    const fallback = await fetchSlackUserList();
    if (fallback.length > 0) {
      return {
        config,
        userOptions: fallback,
        userQuery: rawQuery,
        error: `I couldn't find "${rawQuery}". Choose a Slack user instead.`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Slack user lookup failed.";
    return {
      config,
      userQuery: rawQuery,
      error: formatSlackUserListError(message),
    };
  }

  return {
    config,
    userQuery: rawQuery,
    error: `I couldn't find a Slack user for "${rawQuery}".`,
  };
}

function extractLastUserText(
  messages: ReadonlyArray<{ role?: string; content?: unknown }> | undefined
): string | null {
  if (!messages || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const textParts = content
        .map((part) => {
          if (part && typeof part === "object" && "type" in part && "text" in part) {
            const type = (part as { type?: string }).type;
            const text = (part as { text?: string }).text;
            if (type === "text" && typeof text === "string") {
              return text;
            }
          }
          return null;
        })
        .filter((text): text is string => Boolean(text));
      if (textParts.length > 0) {
        return textParts.join("\n").trim();
      }
    }
  }
  return null;
}

// ============================================================================
// Helper to create assistant source for undo attribution
// ============================================================================

function createToolSource(): AssistantCommandSource {
  // Generate IDs since they're not available from tool execution context
  return {
    type: "assistant",
    messageId: `msg_${nanoid(10)}`,
    toolCallId: `tc_${nanoid(10)}`,
  };
}

// ============================================================================
// Schema Definitions
// ============================================================================

const positionSchema = z.object({
  col: z.number().int().min(0),
  row: z.number().int().min(0),
});

const sizeSchema = z.object({
  cols: z.number().int().min(1).max(12),
  rows: z.number().int().min(1).max(8),
});

const stateSchema = z.object({
  focus: z.number().min(0).max(1).optional(),
  energy: z.number().min(0).max(1).optional(),
  stress: z.number().min(0).max(1).optional(),
  time_pressure: z.number().min(0).max(1).optional(),
  interruptibility: z.number().min(0).max(1).optional(),
  mode: z.enum(["execute", "review", "explore", "recover", "monitor"]).optional(),
  ambient_light: z.enum(["low", "normal", "bright"]).optional(),
  noise_level: z.enum(["quiet", "moderate", "loud"]).optional(),
  motion_context: z.enum(["still", "moving"]).optional(),
});


// ============================================================================
// Tool Definitions
// ============================================================================

// Required config fields for component types - shared validation
// These fields are REQUIRED in config and get merged into query.params
const COMPONENT_REQUIRED_CONFIG: Record<string, { fields: string[]; message: string }> = {
  "slack.channel-activity": {
    fields: ["channelId", "channelName"],
    message: "Slack channel activity needs a channel name or channel ID.",
  },
  "slack.thread-watch": {
    fields: ["threadTs"],
    message: "Slack thread watch needs a thread link or timestamp, plus the channel.",
  },
};

// Config fields that should be merged into dataBinding.query.params
const CONFIG_TO_PARAMS_FIELDS: Record<string, string[]> = {
  "slack.channel-activity": [
    "channelId",
    "channelName",
    "limit",
    "includeThreadReplies",
    "threadRepliesLimit",
  ],
  "slack.thread-watch": ["channelId", "channelName", "threadTs"],
  "slack.mentions": ["userId", "limit"],
};

function validateComponentConfig(
  typeId: string,
  config?: Record<string, unknown>
): { valid: true } | { valid: false; error: string; missingFields: string[]; actionNeeded: string } {
  const requiredConfig = COMPONENT_REQUIRED_CONFIG[typeId];
  if (requiredConfig) {
    const hasRequired = requiredConfig.fields.some((field) => config?.[field] !== undefined);
    if (!hasRequired) {
      return {
        valid: false,
        error: requiredConfig.message,
        missingFields: requiredConfig.fields,
        actionNeeded: "Ask the user for the missing information, then retry with the correct config.",
      };
    }
  }
  return { valid: true };
}

// Merge relevant config fields into dataBinding query params
function mergeConfigToBindingParams(
  typeId: string,
  config: Record<string, unknown> | undefined,
  binding: DataBinding | undefined
): DataBinding | undefined {
  if (!binding) return undefined;

  const fieldsToMerge = CONFIG_TO_PARAMS_FIELDS[typeId];
  if (!fieldsToMerge || !config) return binding;

  const additionalParams: Record<string, unknown> = {};
  for (const field of fieldsToMerge) {
    if (config[field] !== undefined) {
      additionalParams[field] = config[field];
    }
  }

  if (Object.keys(additionalParams).length === 0) return binding;

  return {
    ...binding,
    query: {
      ...binding.query,
      params: { ...binding.query.params, ...additionalParams },
    },
  };
}

// Add Component Tool
const addComponentToolDef = tool({
  description: "Add a new component to the canvas",
  parameters: z.object({
    type_id: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
    position: positionSchema.optional(),
    size: sizeSchema.optional(),
    label: z.string().optional(),
    transform_id: z.string().optional().describe("ID of a transform to apply to this component's data"),
  }),
  execute: async ({ type_id, config, position, size, label, transform_id }) => {
    const store = useStore.getState();
    const getState = useStore.getState;
    const source = createToolSource();
    let batchStarted = false;

    try {
      const normalizedConfig = resolveConfigFromChat(
        type_id,
        config,
        store.lastUserMessage
      );
      // Pre-validate required config fields
      const validation = validateComponentConfig(type_id, normalizedConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          action: validation.actionNeeded,
          missingFields: validation.missingFields,
        };
      }

      try {
        await assertIntegrationAvailable(type_id);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Integration unavailable",
        };
      }

      let resolvedConfig = normalizedConfig;
      if (type_id === "slack.mentions") {
        const resolvedUser = await resolveSlackMentionsUser(normalizedConfig);
        if (resolvedUser.error) {
          if (resolvedUser.userOptions) {
            return {
              success: false,
              error: resolvedUser.error,
              missingFields: ["userId"],
              userOptions: resolvedUser.userOptions,
              userQuery: resolvedUser.userQuery,
            };
          }
          return {
            success: false,
            error: resolvedUser.error,
          };
        }
        resolvedConfig = resolvedUser.config;
      }

      store.startBatch(source, "AI: add_component");
      batchStarted = true;

      // Get default binding, merge config params, and add transform if specified
      const defaultBinding = DEFAULT_BINDINGS[type_id];
      // Build binding with config merged in and transform applied
      const mergedBinding = mergeConfigToBindingParams(type_id, resolvedConfig, defaultBinding);
      const dataBinding = mergedBinding
        ? { ...mergedBinding, transformId: transform_id }
        : undefined;

      const payload: CreateComponentPayload = {
        typeId: type_id,
        config: resolvedConfig ?? {},
        position: position ? { col: position.col, row: position.row } : undefined,
        size: size ? { cols: size.cols, rows: size.rows } : DEFAULT_SIZES[type_id],
        dataBinding,
        meta: {
          createdBy: "assistant",
          label,
        },
      };

      const { componentId, error, assistantMessage } = await addComponentWithFetch(getState, payload);
      if (error) {
        store.abortBatch();
        batchStarted = false;
        return {
          success: false,
          error,
          action: assistantMessage ?? error,
        };
      }

      store.commitBatch();
      batchStarted = false;

      return {
        success: true,
        componentId,
        message: `Added ${getTypeName(type_id)}`,
      };
    } catch (err) {
      if (batchStarted) {
        store.abortBatch();
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

type AddComponentToolArgs = {
  type_id: string;
  config?: Record<string, unknown>;
  position?: { col: number; row: number };
  size?: { cols: number; rows: number };
  label?: string;
  transform_id?: string;
};

const AddComponentToolUI = ({
  args,
  status,
  result,
}: {
  args: AddComponentToolArgs;
  status: { type: string };
  result: unknown;
}) => {
  const needsSlackChannel = shouldOfferSlackChannelPicker(args.type_id, result);
  const needsSlackUser = shouldOfferSlackUserPicker(args.type_id, result);
  const needsInput = needsSlackChannel || needsSlackUser;
  const [resolved, setResolved] = useState(false);
  const errorMessage = resolved ? null : formatToolErrorMessage(result);
  const slackUserOptions =
    result && typeof result === "object"
      ? ((result as { userOptions?: SlackUserListItem[] }).userOptions ?? [])
      : [];

  const handleSlackChannelConfirm = useCallback(
    async (selection: OptionListSelection, channels: SlackChannelListItem[]) => {
      const selectedChannels = resolveSelectedChannels(selection, channels);
      if (selectedChannels.length === 0) {
        return { success: false, error: "Select at least one channel to continue." };
      }

      const store = useStore.getState();
      const getState = useStore.getState;
      const source = createToolSource();
      let batchStarted = false;

      try {
        await assertIntegrationAvailable(args.type_id);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Integration unavailable",
        };
      }

      try {
        store.startBatch(source, "AI: add_component");
        batchStarted = true;

        const baseConfig = resolveConfigFromChat(
          args.type_id,
          args.config as Record<string, unknown> | undefined,
          store.lastUserMessage
        );
        const channel = selectedChannels[0];
        const config = {
          ...(baseConfig ?? {}),
          channelId: channel.id,
          channelName: channel.name,
        };

        const defaultBinding = DEFAULT_BINDINGS[args.type_id];
        const mergedBinding = mergeConfigToBindingParams(args.type_id, config, defaultBinding);
        const dataBinding = mergedBinding
          ? { ...mergedBinding, transformId: args.transform_id }
          : undefined;

        const payload: CreateComponentPayload = {
          typeId: args.type_id,
          config,
          position: args.position ? { col: args.position.col, row: args.position.row } : undefined,
          size: args.size ? { cols: args.size.cols, rows: args.size.rows } : DEFAULT_SIZES[args.type_id],
          dataBinding,
          meta: {
            createdBy: "assistant",
            label: args.label,
          },
        };

        const { error, assistantMessage } = await addComponentWithFetch(getState, payload);
        if (error) {
          store.abortBatch();
          batchStarted = false;
          return { success: false, error: assistantMessage ?? error };
        }

        store.commitBatch();
        batchStarted = false;
        setResolved(true);
        return { success: true };
      } catch (err) {
        if (batchStarted) {
          store.abortBatch();
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    [args]
  );

  const handleSlackUserConfirm = useCallback(
    async (selection: OptionListSelection, users: SlackUserListItem[]) => {
      const selectedUsers = resolveSelectedUsers(selection, users);
      if (selectedUsers.length === 0) {
        return { success: false, error: "Select a Slack user to continue." };
      }

      const store = useStore.getState();
      const getState = useStore.getState;
      const source = createToolSource();
      let batchStarted = false;

      try {
        await assertIntegrationAvailable(args.type_id);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Integration unavailable",
        };
      }

      try {
        store.startBatch(source, "AI: add_component");
        batchStarted = true;

        const baseConfig = resolveConfigFromChat(
          args.type_id,
          args.config as Record<string, unknown> | undefined,
          store.lastUserMessage
        );
        const selectedUser = selectedUsers[0];
        const config = {
          ...(baseConfig ?? {}),
          userId: selectedUser.userId,
        };

        const defaultBinding = DEFAULT_BINDINGS[args.type_id];
        const mergedBinding = mergeConfigToBindingParams(args.type_id, config, defaultBinding);
        const dataBinding = mergedBinding
          ? { ...mergedBinding, transformId: args.transform_id }
          : undefined;

        const payload: CreateComponentPayload = {
          typeId: args.type_id,
          config,
          position: args.position ? { col: args.position.col, row: args.position.row } : undefined,
          size: args.size ? { cols: args.size.cols, rows: args.size.rows } : DEFAULT_SIZES[args.type_id],
          dataBinding,
          meta: {
            createdBy: "assistant",
            label: args.label,
          },
        };

        const { error, assistantMessage } = await addComponentWithFetch(getState, payload);
        if (error) {
          store.abortBatch();
          batchStarted = false;
          return { success: false, error: assistantMessage ?? error };
        }

        store.commitBatch();
        batchStarted = false;
        setResolved(true);
        return { success: true };
      } catch (err) {
        if (batchStarted) {
          store.abortBatch();
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    [args]
  );

  return (
    <div className="flex flex-col gap-1 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <div className="flex items-center gap-2">
        <Plus className="h-3 w-3 text-green-500" />
        <span>Add {args.label ?? getTypeName(args.type_id)}</span>
        <ToolStatus status={status} result={result} needsInput={!resolved && needsInput} resolved={resolved} />
      </div>
      {errorMessage ? (
        <div className={needsInput ? "text-[11px] text-muted-foreground" : "text-[11px] text-red-600"}>
          {errorMessage}
        </div>
      ) : null}
      {needsSlackChannel ? (
        <div className="pt-2">
          <SlackChannelPicker
            id={`slack-channel-picker-${args.type_id}-${args.label ?? "component"}`}
            selectionMode="single"
            onConfirm={handleSlackChannelConfirm}
          />
        </div>
      ) : null}
      {needsSlackUser ? (
        <div className="pt-2">
          <SlackUserPicker
            id={`slack-user-picker-${args.type_id}-${args.label ?? "component"}`}
            selectionMode="single"
            preloadedUsers={slackUserOptions}
            onConfirm={handleSlackUserConfirm}
          />
        </div>
      ) : null}
    </div>
  );
};

export const AddComponentTool = makeAssistantTool({
  ...addComponentToolDef,
  toolName: "add_component",
  render: AddComponentToolUI,
});

// Remove Component Tool
const removeComponentToolDef = tool({
  description: "Remove a component from the canvas by its ID",
  parameters: z.object({
    component_id: z.string(),
  }),
  execute: async ({ component_id }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: remove_component");
    try {
      const result = store.removeComponent(component_id);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      if (err instanceof Error) throw err;
      throw new Error("Unknown error");
    }
  },
});

export const RemoveComponentTool = makeAssistantTool({
  ...removeComponentToolDef,
  toolName: "remove_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Trash2 className="h-3 w-3 text-red-500" />
      <span>Remove component</span>
      <span className="text-muted-foreground font-mono">{args.component_id.slice(0, 8)}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Move Component Tool
const moveComponentToolDef = tool({
  description: "Move a component to a new position on the grid",
  parameters: z.object({
    component_id: z.string(),
    position: positionSchema,
  }),
  execute: async ({ component_id, position }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: move_component");
    try {
      const result = store.moveComponent(component_id, {
        col: position.col,
        row: position.row,
      });
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      if (err instanceof Error) throw err;
      throw new Error("Unknown error");
    }
  },
});

export const MoveComponentTool = makeAssistantTool({
  ...moveComponentToolDef,
  toolName: "move_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Move className="h-3 w-3 text-blue-500" />
      <span>
        Move to ({args.position.col}, {args.position.row})
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Resize Component Tool
const resizeComponentToolDef = tool({
  description: "Resize a component on the grid",
  parameters: z.object({
    component_id: z.string(),
    size: sizeSchema,
  }),
  execute: async ({ component_id, size }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: resize_component");
    try {
      const result = store.resizeComponent(component_id, {
        cols: size.cols,
        rows: size.rows,
      });
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const ResizeComponentTool = makeAssistantTool({
  ...resizeComponentToolDef,
  toolName: "resize_component",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Maximize2 className="h-3 w-3 text-purple-500" />
      <span>
        Resize to {args.size.cols}x{args.size.rows}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Update Component Tool
const updateComponentToolDef = tool({
  description: "Update a component's configuration or label",
  parameters: z.object({
    component_id: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
    label: z.string().optional(),
    pinned: z.boolean().optional(),
  }),
  execute: async ({ component_id, config, label, pinned }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: update_component");
    try {
      const payload: UpdateComponentPayload = {
        componentId: component_id,
        config,
        meta: {
          ...(label !== undefined && { label }),
          ...(pinned !== undefined && { pinned }),
        },
      };

      const result = store.updateComponent(payload);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const UpdateComponentTool = makeAssistantTool({
  ...updateComponentToolDef,
  toolName: "update_component",
  render: ({ args, status }) => {
    const changes: string[] = [];
    if (args.config) changes.push("config");
    if (args.label !== undefined) changes.push("label");
    if (args.pinned !== undefined) changes.push(args.pinned ? "pin" : "unpin");

    return (
      <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
        <Settings className="h-3 w-3 text-orange-500" />
        <span>Update {changes.join(", ") || "component"}</span>
        <ToolStatus status={status} />
      </div>
    );
  },
});

// Clear Canvas Tool
const clearCanvasToolDef = tool({
  description: "Clear all components from the canvas. Use preserve_pinned to keep pinned components.",
  parameters: z.object({
    preserve_pinned: z.boolean().default(true),
  }),
  execute: async ({ preserve_pinned }) => {
    const store = useStore.getState();
    const source = createToolSource();

    store.startBatch(source, "AI: clear_canvas");
    try {
      const result = store.clearCanvas(preserve_pinned ?? true);
      store.commitBatch();

      return {
        success: result.success,
        message: result.explanation,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const ClearCanvasTool = makeAssistantTool({
  ...clearCanvasToolDef,
  toolName: "clear_canvas",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Eraser className="h-3 w-3 text-amber-500" />
      <span>Clear canvas{args.preserve_pinned ? " (keep pinned)" : ""}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Create Transform Tool
const createTransformToolDef = tool({
  description: `Create a reusable data transform. Transforms filter or reshape data from a source.
The code should be a JavaScript function body that receives 'data' and returns the transformed result.
Example: For filtering Slack messages to only show mentions, use:
  code: "return data.filter(m => m.mentions?.some(u => u.username === 'pete'))"`,
  parameters: z.object({
    name: z.string().describe("Short name for the transform, e.g., 'My Mentions'"),
    description: z.string().describe("What this transform does"),
    code: z.string().describe("JavaScript function body. Receives 'data', must return transformed data."),
    compatible_with: z.array(z.object({
      source: z.string().describe("Data source ID (e.g., 'slack', 'github', 'posthog')"),
      query_type: z.string().describe("Query type this works with (e.g., 'channel_messages', 'pull_requests')"),
    })).describe("What data sources this transform is compatible with"),
  }),
  execute: async ({ name, description, code, compatible_with }) => {
    const store = useStore.getState();

    try {
      const id = store.createTransform({
        name,
        description,
        code,
        compatibleWith: compatible_with.map((c) => ({
          source: c.source,
          queryType: c.query_type,
        })),
        createdBy: "assistant",
      });

      return {
        success: true,
        transformId: id,
        message: `Created transform "${name}"`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const CreateTransformTool = makeAssistantTool({
  ...createTransformToolDef,
  toolName: "create_transform",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Filter className="h-3 w-3 text-indigo-500" />
      <span>Create transform: {args.name}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

function formatLookupError(result?: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  if (record.success === false) {
    const error = typeof record.error === "string" ? record.error : null;
    if (error) {
      return error.replace(/^Slack API error:\s*/i, "");
    }
    return "Slack user lookup failed.";
  }
  return null;
}

// Slack User Lookup Tool
const lookupSlackUserToolDef = tool({
  description: `Lookup Slack users by name or handle. Use this when you need a user's Slack handle/ID to filter mentions.`,
  parameters: z.object({
    query: z.string().describe("Name or handle to search (e.g., 'pete' or '@pete')"),
    limit: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
  }),
  execute: async ({ query, limit }) => {
    try {
      const response = await fetch("/api/slack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user_lookup",
          params: { query, limit },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error?.error ?? `Slack API error: ${response.status}`,
        };
      }

      const payload = await response.json();
      return {
        success: true,
        results: payload.data,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const LookupSlackUserTool = makeAssistantTool({
  ...lookupSlackUserToolDef,
  toolName: "lookup_slack_user",
  render: ({ args, status, result }) => {
    const errorMessage = formatLookupError(result);
    const results =
      result && typeof result === "object"
        ? ((result as { results?: Array<{ username?: string; displayName?: string; userId?: string }> }).results ?? [])
        : [];

    return (
      <div className="flex flex-col gap-1 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
        <div className="flex items-center gap-2">
          <Users className="h-3 w-3 text-blue-500" />
          <span>Lookup Slack users: {args.query}</span>
          <ToolStatus status={status} result={result} />
        </div>
        {errorMessage ? (
          <span className="text-red-500">{errorMessage}</span>
        ) : results.length > 0 ? (
          <div className="text-muted-foreground">
            {results
              .slice(0, 3)
              .map((user) => user.displayName || user.username || user.userId)
              .filter(Boolean)
              .join(", ")}
          </div>
        ) : null}
      </div>
    );
  },
});

// Add Filtered Component Tool - combines transform creation and component addition
const addFilteredComponentToolDef = tool({
  description: `Add a component with a custom data filter/transform in one step. Use this when you need to filter or reshape data.
This creates the transform AND adds the component together.`,
  parameters: z.object({
    type_id: z.string().describe("Component type ID (e.g., 'slack.channel-activity')"),
    filter_name: z.string().describe("Short name for the filter (e.g., 'My Mentions')"),
    filter_description: z.string().describe("What the filter does"),
    filter_code: z.string().describe("JavaScript filter code. Receives 'data', returns filtered data. Example: \"return data.filter(m => m.mentions?.some(u => u.username === 'pete'))\""),
    config: z.record(z.string(), z.unknown()).optional().describe("Component config"),
    position: positionSchema.optional(),
    size: sizeSchema.optional(),
    label: z.string().optional(),
  }),
  execute: async ({ type_id, filter_name, filter_description, filter_code, config, position, size, label }) => {
    const store = useStore.getState();
    const getState = useStore.getState;
    const source = createToolSource();
    let batchStarted = false;

    try {
      const normalizedConfig = resolveConfigFromChat(
        type_id,
        config,
        store.lastUserMessage
      );
      // Pre-validate required config fields
      const validation = validateComponentConfig(type_id, normalizedConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          action: validation.actionNeeded,
          missingFields: validation.missingFields,
        };
      }

      try {
        await assertIntegrationAvailable(type_id);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Integration unavailable",
        };
      }

      store.startBatch(source, "AI: add_filtered_component");
      batchStarted = true;
      // Step 1: Create the transform
      const transformId = store.createTransform({
        name: filter_name,
        description: filter_description,
        code: filter_code,
        compatibleWith: [{ source: type_id.split(".")[0], queryType: type_id.split(".")[1] || "default" }],
        createdBy: "assistant",
      });

      // Step 2: Get default binding, merge config params, and add transform
      const defaultBinding = DEFAULT_BINDINGS[type_id];
      // Build binding with config merged in and transform applied
      const mergedBinding = mergeConfigToBindingParams(type_id, normalizedConfig, defaultBinding);
      const dataBinding = mergedBinding
        ? { ...mergedBinding, transformId }
        : undefined;

      // Step 3: Add the component
      const payload: CreateComponentPayload = {
        typeId: type_id,
        config: normalizedConfig ?? {},
        position: position ? { col: position.col, row: position.row } : undefined,
        size: size ? { cols: size.cols, rows: size.rows } : DEFAULT_SIZES[type_id],
        dataBinding,
        meta: {
          createdBy: "assistant",
          label: label ?? filter_name,
        },
      };

      const { componentId, error, assistantMessage } = await addComponentWithFetch(getState, payload);
      if (error) {
        store.deleteTransform(transformId);
        store.abortBatch();
        batchStarted = false;
        return {
          success: false,
          error,
          action: assistantMessage ?? error,
        };
      }

      store.commitBatch();
      batchStarted = false;

      return {
        success: true,
        componentId,
        transformId,
        message: `Added ${filter_name} (filtered ${getTypeName(type_id)})`,
      };
    } catch (err) {
      if (batchStarted) {
        store.abortBatch();
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

type AddFilteredComponentToolArgs = {
  type_id: string;
  filter_name: string;
  filter_description: string;
  filter_code: string;
  config?: Record<string, unknown>;
  position?: { col: number; row: number };
  size?: { cols: number; rows: number };
  label?: string;
};

const AddFilteredComponentToolUI = ({
  args,
  status,
  result,
}: {
  args: AddFilteredComponentToolArgs;
  status: { type: string };
  result: unknown;
}) => {
  const needsSlackChannel = shouldOfferSlackChannelPicker(args.type_id, result);
  const mentionIntent = isMentionsIntent({
    filterName: args.filter_name,
    filterDescription: args.filter_description,
    filterCode: args.filter_code,
  });
  const [resolved, setResolved] = useState(false);
  const lastUserMessage = useStore((s) => s.lastUserMessage);
  const inferredMentionsUser = useMemo(() => {
    if (!mentionIntent) return null;
    const cfg = args.config;
    const explicitId = typeof cfg?.userId === "string" ? cfg.userId.trim() : "";
    const explicitQuery = typeof cfg?.userQuery === "string" ? cfg.userQuery.trim() : "";
    if (explicitId) return { userId: explicitId } satisfies { userId?: string; userQuery?: string };
    if (explicitQuery) return { userQuery: explicitQuery } satisfies { userId?: string; userQuery?: string };
    return inferSlackUserFromText(lastUserMessage ?? "");
  }, [args.config, lastUserMessage, mentionIntent]);
  const [mentionsUser, setMentionsUser] = useState<SlackUserListItem | null>(null);

  useEffect(() => {
    if (!mentionIntent) return;
    if (mentionsUser) return;
    if (!inferredMentionsUser?.userId) return;
    setMentionsUser({ userId: inferredMentionsUser.userId });
  }, [mentionIntent, mentionsUser, inferredMentionsUser]);

  const displayMessage = useMemo(
    () =>
      resolved
        ? null
        : formatAddFilteredComponentToolMessage({
          result,
          mentionIntent,
          hasMentionsUser: Boolean(mentionsUser),
        }),
    [result, mentionIntent, mentionsUser, resolved]
  );

  const handleSlackChannelsConfirm = useCallback(
    async (selection: OptionListSelection, channels: SlackChannelListItem[]) => {
      if (mentionIntent && !mentionsUser) {
        return { success: false, error: "Select a Slack user first." };
      }

      const selectedChannels = resolveSelectedChannels(selection, channels);
      if (selectedChannels.length === 0) {
        return { success: false, error: "Select at least one channel to continue." };
      }

      const store = useStore.getState();
      const getState = useStore.getState;
      const source = createToolSource();
      let batchStarted = false;
      let transformId: string | undefined;

      try {
        await assertIntegrationAvailable(args.type_id);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Integration unavailable",
        };
      }

      try {
        store.startBatch(source, "AI: add_filtered_component");
        batchStarted = true;

        const filterCode = mentionIntent && mentionsUser
          ? buildSlackMentionsFilterCode(mentionsUser)
          : args.filter_code;

        transformId = store.createTransform({
          name: args.filter_name,
          description: args.filter_description,
          code: filterCode,
          compatibleWith: [
            {
              source: args.type_id.split(".")[0],
              queryType: args.type_id.split(".")[1] || "default",
            },
          ],
          createdBy: "assistant",
        });

        const baseConfig = resolveConfigFromChat(
          args.type_id,
          args.config,
          store.lastUserMessage
        );
        const resolvedConfig = applySlackMentionsDefaults(
          args.type_id,
          baseConfig,
          mentionIntent
        );
        const defaultBinding = DEFAULT_BINDINGS[args.type_id];

        for (let index = 0; index < selectedChannels.length; index += 1) {
          const channel = selectedChannels[index];
          const config = {
            ...(resolvedConfig ?? {}),
            channelId: channel.id,
            channelName: channel.name,
          };

          const mergedBinding = mergeConfigToBindingParams(
            args.type_id,
            config,
            defaultBinding
          );
          const dataBinding = mergedBinding
            ? { ...mergedBinding, transformId }
            : undefined;

          const baseLabel = args.label ?? args.filter_name;
          const label =
            selectedChannels.length > 1
              ? `${baseLabel} · #${channel.name}`
              : baseLabel;

          const payload: CreateComponentPayload = {
            typeId: args.type_id,
            config,
            position:
              index === 0 && args.position
                ? { col: args.position.col, row: args.position.row }
                : undefined,
            size: args.size
              ? { cols: args.size.cols, rows: args.size.rows }
              : DEFAULT_SIZES[args.type_id],
            dataBinding,
            meta: {
              createdBy: "assistant",
              label,
            },
          };

          const { error, assistantMessage } = await addComponentWithFetch(
            getState,
            payload
          );
          if (error) {
            throw new Error(assistantMessage ?? error);
          }
        }

        store.commitBatch();
        batchStarted = false;
        setResolved(true);
        return { success: true };
      } catch (err) {
        if (transformId) {
          store.deleteTransform(transformId);
        }
        if (batchStarted) {
          store.abortBatch();
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
    [args, mentionIntent, mentionsUser]
  );

  return (
    <div className="flex flex-col gap-1 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <div className="flex items-center gap-2">
        <Filter className="h-3 w-3 text-indigo-500" />
        <Plus className="h-3 w-3 text-green-500" />
        <span>
          Add filtered {getTypeName(args.type_id)}: {args.filter_name}
        </span>
        <ToolStatus status={status} result={result} needsInput={!resolved && needsSlackChannel} resolved={resolved} />
      </div>
      {displayMessage ? (
        <div
          className={
            displayMessage.tone === "error"
              ? "text-[11px] text-red-600"
              : "text-[11px] text-muted-foreground"
          }
        >
          {displayMessage.message}
        </div>
      ) : null}
      {needsSlackChannel ? (
        <div className="pt-2 flex flex-col gap-3">
          {mentionIntent && !mentionsUser ? (
            <SlackUserPicker
              id={`slack-mentions-user-picker-${args.type_id}-${args.filter_name}`}
              selectionMode="single"
              query={inferredMentionsUser?.userQuery ?? undefined}
              onConfirm={async (selection, users) => {
                const selected = resolveSelectedUsers(selection, users);
                if (selected.length === 0) {
                  return { success: false, error: "Select a Slack user to continue." };
                }
                setMentionsUser(selected[0]);
                return { success: true };
              }}
            />
          ) : null}
          {mentionIntent && !mentionsUser ? null : (
            <SlackChannelPicker
              id={`slack-channel-picker-${args.type_id}-${args.filter_name}`}
              selectionMode="multi"
              allowAll
              onConfirm={handleSlackChannelsConfirm}
            />
          )}
        </div>
      ) : null}
    </div>
  );
};

export const AddFilteredComponentTool = makeAssistantTool({
  ...addFilteredComponentToolDef,
  toolName: "add_filtered_component",
  render: AddFilteredComponentToolUI,
});

// Generate Template Tool
const generateTemplateToolDef = tool({
  description: "Generate components from a template based on cognitive state or a specific template ID.",
  parameters: z.object({
    template_id: z.string().optional(),
    category: z.enum(["focus", "review", "explore", "monitor", "recover"]).optional(),
    params: z.record(z.string(), z.unknown()).optional(),
    state: stateSchema.optional(),
  }),
  execute: async ({ template_id, category, params, state }) => {
    const store = useStore.getState();
    const source = createToolSource();

    registerDefaultTemplates();

    const context = serializeCanvasContext(store.canvas);
    const snapshot = buildStateSnapshotFromSignals(state);
    const intent = deriveIntent(snapshot, context);

    const templates = getAllTemplates();
    if (templates.length === 0) {
      return { success: false, error: "No templates registered" };
    }

    const template = template_id ? getTemplate(template_id) : undefined;
    const ranked = template
      ? { template, reasons: [] as string[] }
      : selectTopTemplate(templates, snapshot, context, {
          category: category ?? intent.category,
        });

    if (!ranked?.template) {
      return { success: false, error: "Template not found" };
    }

    const compilation = compileTemplateToCommands({
      template: ranked.template,
      intent,
      state: snapshot,
      context,
      overrides: params,
      defaultBindings: getDefaultBinding,
      createdBy: "assistant",
    });

    const validationError = validateCanvasCommand(compilation.command);
    if (validationError) {
      return { success: false, error: validationError };
    }

    store.startBatch(source, "AI: generate_template");
    try {
      const results = executeCanvasCommand(store, compilation.command);
      store.commitBatch();

      const summary = summarizeGenerationResults({
        results,
        templateName: ranked.template.name,
        reasons: ranked.reasons ?? [],
        issues: compilation.issues,
      });

      if (!summary.success) {
        return {
          success: false,
          error: summary.error ?? "Template generation failed",
        };
      }

      return {
        success: true,
        templateId: ranked.template.id,
        message: summary.message ?? `Generated ${summary.createdCount} component(s)`,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const GenerateTemplateTool = makeAssistantTool({
  ...generateTemplateToolDef,
  toolName: "generate_template",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Sparkles className="h-3 w-3 text-purple-500" />
      <span>
        Generate template{args.template_id ? ` (${args.template_id})` : ""}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Create Space Tool
const createSpaceToolDef = tool({
  description:
    "Create a new space. Use for organizing related components into separate workspaces. Spaces are ephemeral by default.",
  parameters: z.object({
    name: z.string(),
    components: z
      .array(
        z.object({
          type_id: z.string(),
          config: z.record(z.string(), z.unknown()).optional(),
          position: positionSchema.optional(),
          size: sizeSchema.optional(),
          label: z.string().optional(),
        })
      )
      .optional(),
    switch_to: z.boolean().default(true),
  }),
  execute: async ({ name, components, switch_to }) => {
    const store = useStore.getState();
    const source = createToolSource();
    let createdSpaceId: string | null = null;
    let addedCount = 0;
    let batchStarted = false;

    try {
      if (components && components.length > 0 && switch_to) {
        for (const comp of components) {
          const normalizedConfig = resolveConfigFromChat(
            comp.type_id,
            comp.config,
            store.lastUserMessage
          );
          const validation = validateComponentConfig(comp.type_id, normalizedConfig);
          if (!validation.valid) {
            return {
              success: false,
              error: validation.error,
              action: validation.actionNeeded,
              missingFields: validation.missingFields,
            };
          }
        }
      }

      store.startBatch(source, "AI: create_space");
      batchStarted = true;

      const spaceId = store.createEmptySpace({
        name,
        createdBy: "assistant",
        switchTo: switch_to,
      });
      createdSpaceId = spaceId;

      // Add components if provided
      if (components && components.length > 0 && switch_to) {
        const errors: string[] = [];
        let successfulAdds = 0;

        for (const comp of components) {
          try {
            await assertIntegrationAvailable(comp.type_id);
          } catch (err) {
            errors.push(
              `${comp.type_id}: ${err instanceof Error ? err.message : "Integration unavailable"}`
            );
            continue;
          }
          const normalizedConfig = resolveConfigFromChat(
            comp.type_id,
            comp.config,
            store.lastUserMessage
          );
          const dataBinding = mergeConfigToBindingParams(
            comp.type_id,
            normalizedConfig,
            DEFAULT_BINDINGS[comp.type_id]
          );

          const payload: CreateComponentPayload = {
            typeId: comp.type_id,
            config: normalizedConfig ?? {},
            position: comp.position ? { col: comp.position.col, row: comp.position.row } : undefined,
            size: comp.size ? { cols: comp.size.cols, rows: comp.size.rows } : DEFAULT_SIZES[comp.type_id],
            dataBinding,
            meta: {
              createdBy: "assistant",
              label: comp.label,
            },
          };

          const { error } = await addComponentWithFetch(useStore.getState, payload);
          if (error) {
            errors.push(`${comp.type_id}: ${error}`);
          } else {
            successfulAdds += 1;
          }
        }
        addedCount = successfulAdds;

        if (errors.length > 0) {
          if (successfulAdds === 0) {
            store.deleteSpace(spaceId);
            store.abortBatch();
            batchStarted = false;
          } else {
            store.commitBatch();
            batchStarted = false;
          }
          return {
            success: false,
            error: `Some components could not be added:\n${errors.join("\n")}`,
            action: "Resolve these issues before retrying.",
          };
        }
      }

      store.commitBatch();
      batchStarted = false;

      return {
        success: true,
        spaceId,
        message: `Created space "${name}"${components ? ` with ${components.length} components` : ""}`,
      };
    } catch (err) {
      if (batchStarted) {
        store.abortBatch();
      }
      if (createdSpaceId && addedCount === 0) {
        store.deleteSpace(createdSpaceId);
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const CreateSpaceTool = makeAssistantTool({
  ...createSpaceToolDef,
  toolName: "create_space",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <LayoutGrid className="h-3 w-3 text-blue-500" />
      <span>
        Create space &quot;{args.name}&quot;
        {args.components?.length ? ` with ${args.components.length} components` : ""}
      </span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Switch Space Tool
const switchSpaceToolDef = tool({
  description: "Switch to an existing space by name or ID",
  parameters: z.object({
    space: z.string(),
  }),
  execute: async ({ space }) => {
    const store = useStore.getState();
    const source = createToolSource();
    const spaces = store.getSpaces();

    const targetSpace = spaces.find((s) => s.id === space || s.name === space);
    if (!targetSpace) {
      return {
        success: false,
        error: `Space not found: ${space}`,
      };
    }

    store.startBatch(source, "AI: switch_space");
    try {
      const result = store.loadSpace(targetSpace.id);
      store.commitBatch();

      return {
        success: result.success,
        message: `Switched to space "${targetSpace.name}"`,
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const SwitchSpaceTool = makeAssistantTool({
  ...switchSpaceToolDef,
  toolName: "switch_space",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <ArrowRightLeft className="h-3 w-3 text-cyan-500" />
      <span>Switch to &quot;{args.space}&quot;</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Pin Space Tool
const pinSpaceToolDef = tool({
  description: "Pin a space to keep it. Unpinned spaces may be auto-cleaned after 7 days.",
  parameters: z.object({
    space: z.string().optional(),
  }),
  execute: async ({ space }) => {
    const store = useStore.getState();
    const source = createToolSource();

    let spaceId: string | null = null;

    if (space) {
      const spaces = store.getSpaces();
      const targetSpace = spaces.find((s) => s.id === space || s.name === space);
      if (!targetSpace) {
        return {
          success: false,
          error: `Space not found: ${space}`,
        };
      }
      spaceId = targetSpace.id;
    } else {
      const state = store as unknown as { activeSpaceId: string | null };
      spaceId = state.activeSpaceId;
    }

    if (!spaceId) {
      return {
        success: false,
        error: "No space specified and no active space",
      };
    }

    store.startBatch(source, "AI: pin_space");
    try {
      store.pinSpace(spaceId);
      store.commitBatch();

      return {
        success: true,
        message: "Space pinned",
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const PinSpaceTool = makeAssistantTool({
  ...pinSpaceToolDef,
  toolName: "pin_space",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <Pin className="h-3 w-3 text-yellow-500" />
      <span>Pin {args.space ? `"${args.space}"` : "current space"}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// Unpin Space Tool
const unpinSpaceToolDef = tool({
  description: "Unpin a space. Unpinned spaces may be auto-cleaned after 7 days of inactivity.",
  parameters: z.object({
    space: z.string().optional(),
  }),
  execute: async ({ space }) => {
    const store = useStore.getState();
    const source = createToolSource();

    let spaceId: string | null = null;

    if (space) {
      const spaces = store.getSpaces();
      const targetSpace = spaces.find((s) => s.id === space || s.name === space);
      if (!targetSpace) {
        return {
          success: false,
          error: `Space not found: ${space}`,
        };
      }
      spaceId = targetSpace.id;
    } else {
      const state = store as unknown as { activeSpaceId: string | null };
      spaceId = state.activeSpaceId;
    }

    if (!spaceId) {
      return {
        success: false,
        error: "No space specified and no active space",
      };
    }

    store.startBatch(source, "AI: unpin_space");
    try {
      store.unpinSpace(spaceId);
      store.commitBatch();

      return {
        success: true,
        message: "Space unpinned",
      };
    } catch (err) {
      store.abortBatch();
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
});

export const UnpinSpaceTool = makeAssistantTool({
  ...unpinSpaceToolDef,
  toolName: "unpin_space",
  render: ({ args, status }) => (
    <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <PinOff className="h-3 w-3 text-gray-500" />
      <span>Unpin {args.space ? `"${args.space}"` : "current space"}</span>
      <ToolStatus status={status} />
    </div>
  ),
});

// ============================================================================
// Combined Tools Component
// ============================================================================

/**
 * Mount all canvas tools inside AssistantRuntimeProvider.
 * Tools register themselves and execute automatically when called by AI.
 */
export function CanvasTools() {
  const lastUserMessage = useAssistantState((state) =>
    extractLastUserText(
      state.thread?.messages as ReadonlyArray<{ role?: string; content?: unknown }>
    )
  );
  const setLastUserMessage = useStore((state) => state.setLastUserMessage);

  useEffect(() => {
    setLastUserMessage(lastUserMessage ?? null);
  }, [lastUserMessage, setLastUserMessage]);

  return (
    <>
      <AddComponentTool />
      <RemoveComponentTool />
      <MoveComponentTool />
      <ResizeComponentTool />
      <UpdateComponentTool />
      <ClearCanvasTool />
      <CreateTransformTool />
      <LookupSlackUserTool />
      <AddFilteredComponentTool />
      <GenerateTemplateTool />
      <CreateSpaceTool />
      <SwitchSpaceTool />
      <PinSpaceTool />
      <UnpinSpaceTool />
    </>
  );
}
