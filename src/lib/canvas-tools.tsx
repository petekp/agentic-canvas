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
import { compilePreference, getRuleEntry, resolveRuleTargetForBinding } from "@/lib/rules";
import {
  assertIntegrationAvailable,
  getIntegrationStatus,
  type IntegrationStatus,
} from "@/lib/integration-preflight";
import { resolveConfigFromChat } from "@/lib/tool-config";
import { inferSlackUserFromText } from "@/lib/component-config";
import { buildSlackMentionsFilterCode } from "@/lib/slack-mentions-filter";
import { applySlackMentionsChannelActivityDefaults } from "@/lib/slack-mentions-defaults";
import { normalizeFilterCodeForType } from "@/lib/filter-code";
import {
  formatAddFilteredComponentToolMessage,
  formatToolErrorMessage,
  isSlackChannelMissing,
} from "@/lib/tool-ui-messages";
import { trackClientTelemetry } from "@/lib/telemetry-client";
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
import { syncSpaceRoute } from "@/lib/space-route-sync";
import type { AssistantCommandSource } from "@/lib/undo/types";
import type { CreateComponentPayload, UpdateComponentPayload, DataBinding } from "@/types";
import {
  AsyncOptionList,
  type OptionListSelection,
  type OptionListOption,
} from "@/components/tool-ui/option-list";
import { Button } from "@/components/ui/button";
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

type GitHubRepoListItem = {
  fullName: string;
  description?: string;
  isPrivate?: boolean;
  updatedAt?: number;
};

type VercelProjectListItem = {
  id: string;
  name: string;
  framework?: string;
  teamId?: string;
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

async function fetchGitHubRepoList(): Promise<GitHubRepoListItem[]> {
  const response = await fetch("/api/github", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user_repos", params: {} }),
  });

  if (!response.ok) {
    const error = await response.json();
    const message = error?.error ?? `GitHub API error: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function formatGitHubRepoListError(error: string): string {
  if (/GITHUB_TOKEN/i.test(error)) {
    return "GitHub isn't connected yet. Connect GitHub to list your repos.";
  }
  return error;
}

async function fetchVercelProjectList(): Promise<VercelProjectListItem[]> {
  const response = await fetch("/api/vercel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "project_list", params: {} }),
  });

  if (!response.ok) {
    const error = await response.json();
    const message = error?.error ?? `Vercel API error: ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json();
  return Array.isArray(payload.data) ? payload.data : [];
}

function formatVercelProjectListError(error: string): string {
  if (/VERCEL_TOKEN/i.test(error)) {
    return "Vercel isn't connected yet. Connect Vercel to list projects.";
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

function GitHubRepoPicker({
  id,
  onConfirm,
}: {
  id: string;
  onConfirm: (selection: OptionListSelection, repos: GitHubRepoListItem[]) => Promise<{ success: boolean; error?: string }>;
}) {
  const loadOptions = useCallback(async () => {
    try {
      const repos = await fetchGitHubRepoList();
      const sorted = [...repos].sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? ""));

      const options: OptionListOption[] = sorted.map((repo) => {
        const visibility = repo.isPrivate ? "Private" : "Public";
        const updatedAt = repo.updatedAt ? new Date(repo.updatedAt).toLocaleDateString() : "Unknown update";
        const description = [visibility, `Updated ${updatedAt}`, repo.description]
          .filter(Boolean)
          .join(" · ");
        return {
          id: repo.fullName,
          label: repo.fullName,
          description,
        };
      });

      return {
        options,
        context: sorted,
        emptyMessage: "No GitHub repositories available.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load repos";
      throw new Error(formatGitHubRepoListError(message));
    }
  }, []);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection, repos?: GitHubRepoListItem[]) =>
      onConfirm(selection, repos ?? []),
    [onConfirm]
  );

  return (
    <AsyncOptionList
      id={id}
      selectionMode="multi"
      minSelections={1}
      maxSelections={8}
      loadingMessage="Loading GitHub repositories..."
      emptyMessage="No GitHub repositories found."
      loadOptions={loadOptions}
      onConfirm={handleConfirm}
    />
  );
}

function VercelProjectPicker({
  id,
  onConfirm,
  optional = true,
}: {
  id: string;
  optional?: boolean;
  onConfirm: (
    selection: OptionListSelection,
    projects: VercelProjectListItem[]
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const loadOptions = useCallback(async () => {
    try {
      const projects = await fetchVercelProjectList();
      const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

      const options: OptionListOption[] = sorted.map((project) => ({
        id: project.id,
        label: project.name,
        description: project.framework ? `Framework: ${project.framework}` : undefined,
      }));

      return {
        options,
        context: sorted,
        emptyMessage: "No Vercel projects available.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      throw new Error(formatVercelProjectListError(message));
    }
  }, []);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection, projects?: VercelProjectListItem[]) =>
      onConfirm(selection, projects ?? []),
    [onConfirm]
  );

  return (
    <AsyncOptionList
      id={id}
      selectionMode="single"
      minSelections={optional ? 0 : 1}
      loadingMessage="Loading Vercel projects..."
      emptyMessage="No Vercel projects found."
      loadOptions={loadOptions}
      onConfirm={handleConfirm}
    />
  );
}

function SlackMentionsPicker({
  id,
  onConfirm,
}: {
  id: string;
  onConfirm: (
    selection: OptionListSelection,
    users: SlackUserListItem[]
  ) => Promise<{ success: boolean; error?: string }>;
}) {
  const loadOptions = useCallback(async () => {
    try {
      const { users, emptyMessage } = await resolveSlackUserOptions();
      return {
        options: users.map((user) => {
          const label = user.displayName || user.username || user.userId;
          const details = [user.username ? `@${user.username}` : null, user.userId]
            .filter(Boolean)
            .join(" • ");
          return {
            id: user.userId,
            label,
            description: details || undefined,
          };
        }),
        context: users,
        emptyMessage,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      throw new Error(formatSlackUserListError(message));
    }
  }, []);

  const handleConfirm = useCallback(
    async (selection: OptionListSelection, users?: SlackUserListItem[]) =>
      onConfirm(selection, users ?? []),
    [onConfirm]
  );

  return (
    <AsyncOptionList
      id={id}
      selectionMode="single"
      minSelections={0}
      loadingMessage="Loading Slack users..."
      emptyMessage="No Slack users found."
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
    "briefing.recommendations": "briefing recommendations",
    "system.morning-brief": "morning brief",
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

function resolveSelectedRepos(
  selection: OptionListSelection,
  repos: GitHubRepoListItem[]
): GitHubRepoListItem[] {
  if (!selection) return [];
  const selectedIds = Array.isArray(selection) ? selection : [selection];
  const selectedSet = new Set(selectedIds);
  return repos.filter((repo) => selectedSet.has(repo.fullName));
}

function resolveSelectedProjects(
  selection: OptionListSelection,
  projects: VercelProjectListItem[]
): VercelProjectListItem[] {
  if (!selection) return [];
  const selectedIds = Array.isArray(selection) ? selection : [selection];
  const selectedSet = new Set(selectedIds);
  return projects.filter((project) => selectedSet.has(project.id));
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

type ToolTelemetryContext = {
  args?: unknown;
  source?: AssistantCommandSource;
};

function logToolStart(toolName: string, context: ToolTelemetryContext) {
  void trackClientTelemetry({
    source: `tool.${toolName}`,
    event: "start",
    data: context,
  });
}

function logToolResult(toolName: string, result: unknown) {
  void trackClientTelemetry({
    source: `tool.${toolName}`,
    event: "result",
    data: result,
  });
}

function logToolError(toolName: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  void trackClientTelemetry({
    source: `tool.${toolName}`,
    event: "error",
    data: { error: message },
    level: "error",
  });
}

async function withToolTelemetry<T>(
  toolName: string,
  context: ToolTelemetryContext,
  run: () => Promise<T>
): Promise<T> {
  logToolStart(toolName, context);
  try {
    const result = await run();
    logToolResult(toolName, result);
    return result;
  } catch (error) {
    logToolError(toolName, error);
    throw error;
  }
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
  "github.pr-list": ["repo", "state", "filter", "limit"],
  "github.issue-grid": ["repo", "state", "filter", "limit"],
  "github.activity-timeline": ["repo", "limit", "username"],
  "github.team-activity": ["repo", "timeWindow"],
  "slack.channel-activity": [
    "channelId",
    "channelName",
    "limit",
    "includeThreadReplies",
    "threadRepliesLimit",
  ],
  "slack.thread-watch": ["channelId", "channelName", "threadTs"],
  "slack.mentions": ["userId", "limit"],
  "vercel.deployments": ["projectId", "teamId", "limit", "state"],
  "vercel.project-status": ["projectId", "teamId"],
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
  execute: async (args) =>
    withToolTelemetry("add_component", { args }, async () => {
      const { type_id, config, position, size, label, transform_id } = args;
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

        const { componentId, error, assistantMessage } = await addComponentWithFetch(
          getState,
          payload
        );
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
    }),
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
  result?: unknown;
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
  execute: async (args) =>
    withToolTelemetry("remove_component", { args }, async () => {
      const { component_id } = args;
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
    }),
});

export const RemoveComponentTool = makeAssistantTool({
  ...removeComponentToolDef,
  toolName: "remove_component",
  render: ({ args, status, result }) => {
    const componentIdBadge =
      typeof args.component_id === "string" && args.component_id.length > 0
        ? args.component_id.slice(0, 8)
        : "unknown";
    const errorMessage = formatToolErrorMessage(result);

    return (
      <div className="flex flex-col gap-1 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
        <div className="flex items-center gap-2">
          <Trash2 className="h-3 w-3 text-red-500" />
          <span>Remove component</span>
          <span className="text-muted-foreground font-mono">{componentIdBadge}</span>
          <ToolStatus status={status} result={result} />
        </div>
        {errorMessage ? (
          <div className="text-[11px] text-red-600">{errorMessage}</div>
        ) : null}
      </div>
    );
  },
});

// Move Component Tool
const moveComponentToolDef = tool({
  description: "Move a component to a new position on the grid",
  parameters: z.object({
    component_id: z.string(),
    position: positionSchema,
  }),
  execute: async (args) =>
    withToolTelemetry("move_component", { args }, async () => {
      const { component_id, position } = args;
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
    }),
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
  execute: async (args) =>
    withToolTelemetry("resize_component", { args }, async () => {
      const { component_id, size } = args;
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
    }),
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
  execute: async (args) =>
    withToolTelemetry("update_component", { args }, async () => {
      const { component_id, config, label, pinned } = args;
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
    }),
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
  execute: async (args) =>
    withToolTelemetry("clear_canvas", { args }, async () => {
      const { preserve_pinned } = args;
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
    }),
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
  execute: async (args) =>
    withToolTelemetry("create_transform", { args }, async () => {
      const { name, description, code, compatible_with } = args;
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
    }),
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

// Set Preference Rules Tool
const setPreferenceRulesToolDef = tool({
  description:
    "Store personalization rules for a data target (mentions, PRs, issues, deployments).",
  parameters: z.object({
    patch: z.unknown().describe("Preference patch JSON (object or string)."),
  }),
  execute: async (args) =>
    withToolTelemetry("set_preference_rules", { args }, async () => {
      const { patch } = args;
      const store = useStore.getState();

      const compiled = compilePreference(patch);
      if (!compiled.patch) {
        return {
          success: false,
          error: "Invalid preference patch.",
          errors: compiled.errors,
        };
      }

      try {
        store.setRulesForTarget(compiled.patch.target, compiled.patch.rules);

        const refreshTargets = store.canvas.components.filter((component) => {
          if (!component.dataBinding) return false;
          return resolveRuleTargetForBinding(component.dataBinding) === compiled.patch?.target;
        });

        await Promise.allSettled(
          refreshTargets.map((component) => store.refreshComponent(component.id))
        );

        const explanations = compiled.patch.rules.map((rule) => {
          const entry = getRuleEntry(rule.type);
          return entry?.explain(rule) ?? rule.type;
        });

        return {
          success: true,
          target: compiled.patch.target,
          ruleCount: compiled.patch.rules.length,
          summary: compiled.patch.summary,
          explanations,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
});

export const SetPreferenceRulesTool = makeAssistantTool({
  ...setPreferenceRulesToolDef,
  toolName: "set_preference_rules",
  render: ({ status, result }) => {
    const errorMessage = formatToolErrorMessage(result);
    const record = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
    const target = typeof record?.target === "string" ? record?.target : null;
    const summary = typeof record?.summary === "string" ? record?.summary : null;
    const explanations = Array.isArray(record?.explanations)
      ? (record?.explanations as string[]).filter((item) => typeof item === "string")
      : [];

    return (
      <div className="flex flex-col gap-1 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span>{target ? `Set rules for ${target}` : "Set preference rules"}</span>
          <ToolStatus status={status} result={result} />
        </div>
        {errorMessage ? (
          <span className="text-red-500">{errorMessage}</span>
        ) : (
          <>
            {summary ? <span className="text-muted-foreground">{summary}</span> : null}
            {explanations.length > 0 ? (
              <div className="text-muted-foreground">
                {explanations.slice(0, 3).join(" ")}
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  },
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
  execute: async (args) =>
    withToolTelemetry("lookup_slack_user", { args }, async () => {
      const { query, limit } = args;
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
    }),
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
const ADD_COMPONENT_INTENT_INSTRUCTION = `Score 1.0 only if the user explicitly asks to add a new component/tile/widget to the canvas.
Score 0.0 if the user is asking to prioritize, sort, filter, or personalize existing data or an existing component.
Only explicit add requests should score high.`;

async function requireExplicitAddIntent(
  lastUserMessage: string | null
): Promise<{ allowed: boolean; error?: string }> {
  const message =
    typeof lastUserMessage === "string" ? lastUserMessage.trim() : "";
  if (!message) {
    return {
      allowed: false,
      error:
        "Action needed: This tool only runs when the user explicitly asks to add a new component.",
    };
  }

  try {
    const response = await fetch("/api/rules/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: ADD_COMPONENT_INTENT_INSTRUCTION,
        items: [{ key: "intent", text: message }],
      }),
    });

    if (!response.ok) {
      return {
        allowed: false,
        error:
          "Action needed: Unable to verify add-component intent. Use set_preference_rules for preference changes.",
      };
    }

    const payload = (await response.json()) as {
      scores?: Array<{ key: string; score: number }>;
    };
    const score = payload?.scores?.find((entry) => entry.key === "intent")
      ?.score;

    if (typeof score !== "number" || !Number.isFinite(score) || score < 0.6) {
      return {
        allowed: false,
        error:
          "Action needed: Use set_preference_rules to prioritize/sort/filter existing data. add_filtered_component is only for explicit add-component requests.",
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Failed to verify add-component intent:", error);
    return {
      allowed: false,
      error:
        "Action needed: Unable to verify add-component intent. Use set_preference_rules for preference changes.",
    };
  }
}

const addFilteredComponentToolDef = tool({
  description: `Add a component with a custom data filter/transform in one step. Use this ONLY when the user explicitly asks to add a new component/tile/widget.
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
  execute: async (args) =>
    withToolTelemetry("add_filtered_component", { args }, async () => {
      const { type_id, filter_name, filter_description, filter_code, config, position, size, label } = args;
      const store = useStore.getState();
      const getState = useStore.getState;
      const source = createToolSource();
      let batchStarted = false;

      try {
        const intentCheck = await requireExplicitAddIntent(store.lastUserMessage);
        if (!intentCheck.allowed) {
          return {
            success: false,
            error:
              intentCheck.error ??
              "Action needed: Use set_preference_rules for preference changes.",
            action:
              "Use set_preference_rules to update preferences; add_filtered_component only when explicitly asked to add a component.",
          };
        }

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

        const normalizedFilterCode = normalizeFilterCodeForType(
          type_id,
          filter_code
        );

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
          code: normalizedFilterCode,
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
    }),
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
  result?: unknown;
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
          : normalizeFilterCodeForType(args.type_id, args.filter_code);

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
  execute: async (args) =>
    withToolTelemetry("generate_template", { args }, async () => {
      const { template_id, category, params, state } = args;
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
    }),
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

// Generate Briefing Tool
const generateBriefingToolDef = tool({
  description:
    "Guided setup for a Morning Briefing space with GitHub repos, Slack mentions, and Vercel deployments.",
  parameters: z.object({
    name: z.string().optional(),
  }),
  execute: async (args) =>
    withToolTelemetry("generate_briefing", { args }, async () => {
      const { name } = args;
      return {
        success: true,
        needsSetup: true,
        name: name ?? "Morning Briefing",
      };
    }),
});

type GenerateBriefingToolArgs = {
  name?: string;
};

type BriefingStep = "repos" | "slack" | "vercel" | "confirm" | "done";

const GenerateBriefingToolUI = ({
  args,
  status,
}: {
  args: GenerateBriefingToolArgs;
  status: { type: string };
}) => {
  const [step, setStep] = useState<BriefingStep>("repos");
  const [selectedRepos, setSelectedRepos] = useState<GitHubRepoListItem[]>([]);
  const [selectedSlackUser, setSelectedSlackUser] = useState<SlackUserListItem | null>(null);
  const [selectedSlackChannels, setSelectedSlackChannels] = useState<SlackChannelListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<VercelProjectListItem | null>(null);
  const [resolved, setResolved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);

  const slackMentionsAvailable = integrationStatus ? integrationStatus.slack.user : true;
  const slackBotAvailable = integrationStatus ? integrationStatus.slack.bot : true;
  const slackStepAvailable = slackMentionsAvailable || slackBotAvailable;
  const vercelAvailable = integrationStatus ? integrationStatus.vercel : true;

  useEffect(() => {
    let cancelled = false;
    getIntegrationStatus()
      .then((status) => {
        if (!cancelled) setIntegrationStatus(status);
      })
      .catch(() => {
        if (!cancelled) setIntegrationStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextStepAfterRepos = useCallback(() => {
    if (slackStepAvailable) return "slack";
    if (vercelAvailable) return "vercel";
    return "confirm";
  }, [slackStepAvailable, vercelAvailable]);

  const nextStepAfterSlack = useCallback(() => {
    if (vercelAvailable) return "vercel";
    return "confirm";
  }, [vercelAvailable]);

  const handleCreateBriefing = useCallback(async () => {
    setError(null);
    if (selectedRepos.length === 0) {
      setError("Select at least one GitHub repository.");
      return;
    }

    const store = useStore.getState();
    const source = createToolSource();
    let batchStarted = false;
    let createdSpaceId: string | null = null;

    try {
      registerDefaultTemplates();

      const template = getTemplate("briefing/morning-v1");
      if (!template) {
        setError("Briefing template not found.");
        return;
      }

      const primaryRepo = selectedRepos[0]?.fullName ?? "assistant-ui/assistant-ui";
      const now = Date.now();
      const initialSince = now - 24 * 60 * 60 * 1000;
      const overrides = {
        repos: selectedRepos.map((repo) => repo.fullName),
        primaryRepo,
        slackUserId: selectedSlackUser?.userId,
        slackChannels: selectedSlackChannels.map((channel) => ({
          id: channel.id,
          name: channel.name,
        })),
        vercelProjectId: selectedProject?.id,
        vercelTeamId: selectedProject?.teamId,
      };

      const context = serializeCanvasContext(store.canvas);
      const snapshot = buildStateSnapshotFromSignals();
      const intent = deriveIntent(snapshot, context);

      const compilation = compileTemplateToCommands({
        template,
        intent,
        state: snapshot,
        context,
        overrides,
        defaultBindings: getDefaultBinding,
        createdBy: "assistant",
      });

      const commandList =
        compilation.command.type === "batch"
          ? compilation.command.payload.commands
          : [compilation.command];

      let filteredCommands = commandList.filter((command) => {
        if (command.type !== "component.create") return false;
        if (command.payload.typeId === "slack.mentions" && !selectedSlackUser && selectedSlackChannels.length === 0) {
          return false;
        }
        if (command.payload.typeId === "vercel.deployments" && !selectedProject) return false;
        if (command.payload.typeId === "github.issue-grid" && selectedRepos.length < 2) return false;
        return true;
      });

      const vercelProjectId = selectedProject?.id;
      const vercelTeamId = selectedProject?.teamId;
      const slackChannelSelection = selectedSlackChannels.map((channel) => ({
        id: channel.id,
        name: channel.name,
      }));

      filteredCommands = filteredCommands.map((command) => {
        if (command.type !== "component.create") return command;

        if (command.payload.typeId === "slack.mentions" && !selectedSlackUser && selectedSlackChannels.length > 0) {
          const channel = selectedSlackChannels[0];
          return {
            ...command,
            payload: {
              ...command.payload,
              typeId: "slack.channel-activity",
              config: {
                channelId: channel.id,
                channelName: channel.name,
                limit: 10,
              },
              dataBinding: {
                source: "slack",
                query: {
                  type: "channel_activity",
                  params: {
                    channelId: channel.id,
                    limit: 10,
                  },
                },
                refreshInterval: 60000,
              },
              meta: {
                ...command.payload.meta,
                label: "Channel Activity",
              },
            },
          };
        }

        if (command.payload.typeId === "vercel.deployments") {
          const nextConfig = {
            ...(command.payload.config ?? {}),
            ...(vercelProjectId ? { projectId: vercelProjectId } : {}),
            ...(vercelTeamId ? { teamId: vercelTeamId } : {}),
          } as Record<string, unknown>;

          const nextParams = {
            ...(command.payload.dataBinding?.query.params ?? {}),
            ...(vercelProjectId ? { projectId: vercelProjectId } : {}),
            ...(vercelTeamId ? { teamId: vercelTeamId } : {}),
          } as Record<string, unknown>;

          if (!vercelProjectId) {
            delete nextConfig.projectId;
            delete nextParams.projectId;
          }
          if (!vercelTeamId) {
            delete nextConfig.teamId;
            delete nextParams.teamId;
          }

          return {
            ...command,
            payload: {
              ...command.payload,
              config: nextConfig,
              dataBinding: command.payload.dataBinding
                ? {
                    ...command.payload.dataBinding,
                    query: {
                      ...command.payload.dataBinding.query,
                      params: nextParams,
                    },
                  }
                : command.payload.dataBinding,
            },
          };
        }

        if (command.payload.typeId !== "briefing.recommendations") return command;

        const nextConfig = {
          ...(command.payload.config ?? {}),
          sinceTimestamp: initialSince,
          ...(selectedSlackChannels.length > 0 ? { slackChannels: slackChannelSelection } : {}),
          ...(vercelProjectId ? { vercelProjectId } : {}),
          ...(vercelTeamId ? { vercelTeamId } : {}),
        } as Record<string, unknown>;

        const nextParams = {
          ...(command.payload.dataBinding?.query.params ?? {}),
          since: initialSince,
          ...(selectedSlackChannels.length > 0 ? { slackChannels: slackChannelSelection } : {}),
          ...(vercelProjectId ? { vercelProjectId } : {}),
          ...(vercelTeamId ? { vercelTeamId } : {}),
        } as Record<string, unknown>;

        if (!vercelProjectId) {
          delete nextConfig.vercelProjectId;
          delete nextParams.vercelProjectId;
        }
        if (!vercelTeamId) {
          delete nextConfig.vercelTeamId;
          delete nextParams.vercelTeamId;
        }
        if (selectedSlackChannels.length === 0 && !selectedSlackUser) {
          delete nextConfig.slackChannels;
          delete nextParams.slackChannels;
        }

        return {
          ...command,
          payload: {
            ...command.payload,
            config: nextConfig,
            dataBinding: command.payload.dataBinding
              ? {
                  ...command.payload.dataBinding,
                  query: {
                    ...command.payload.dataBinding.query,
                    params: nextParams,
                  },
                }
              : command.payload.dataBinding,
          },
        };
      });

      if (selectedRepos.length < 2) {
        filteredCommands = filteredCommands.map((command) => {
          if (command.type !== "component.create") return command;
          if (command.payload.typeId !== "github.pr-list") return command;
          return {
            ...command,
            payload: {
              ...command.payload,
              size: { cols: 6, rows: 4 },
            },
          };
        });
      }

      if (filteredCommands.length === 0) {
        setError("No components were generated for the briefing.");
        return;
      }

      setCreating(true);
      store.startBatch(source, "AI: generate_briefing");
      batchStarted = true;

      const spaceName = args.name ?? "Morning Briefing";
      const spaceId = store.createEmptySpace({
        name: spaceName,
        createdBy: "assistant",
        switchTo: true,
        briefingConfig: {
          repos: overrides.repos,
          slackUserId: overrides.slackUserId,
          slackChannels: overrides.slackChannels,
          vercelProjectId: overrides.vercelProjectId,
          vercelTeamId: overrides.vercelTeamId,
          sinceTimestamp: initialSince,
        },
      });
      createdSpaceId = spaceId;

      const errors: string[] = [];
      let successfulAdds = 0;

      for (const command of filteredCommands) {
        if (command.type !== "component.create") continue;

        if (command.payload.typeId.startsWith("slack.")) {
          try {
            await assertIntegrationAvailable(command.payload.typeId);
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Slack integration unavailable");
            continue;
          }
        }

        if (command.payload.typeId.startsWith("vercel.")) {
          try {
            await assertIntegrationAvailable(command.payload.typeId);
          } catch (err) {
            errors.push(err instanceof Error ? err.message : "Vercel integration unavailable");
            continue;
          }
        }

        const { error: addError } = await addComponentWithFetch(useStore.getState, command.payload);
        if (addError) {
          errors.push(addError);
        } else {
          successfulAdds += 1;
        }
      }

      if (errors.length > 0) {
        if (successfulAdds === 0) {
          store.deleteSpace(spaceId);
          store.abortBatch();
          batchStarted = false;
        } else {
          store.commitBatch();
          batchStarted = false;
        }
        setError(`Some components could not be added:\n${errors.join("\n")}`);
        setResolved(true);
        setStep("done");
        return;
      }

      store.commitBatch();
      batchStarted = false;
      setResolved(true);
      setStep("done");
    } catch (err) {
      if (batchStarted) {
        store.abortBatch();
      }
      if (createdSpaceId) {
        store.deleteSpace(createdSpaceId);
      }
      setError(err instanceof Error ? err.message : "Failed to create briefing");
    } finally {
      setCreating(false);
    }
  }, [args.name, selectedRepos, selectedSlackUser, selectedSlackChannels, selectedProject]);

  const renderStep = () => {
    if (step === "repos") {
      return (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-muted-foreground">
            Pick one or more GitHub repositories to track.
          </div>
          <GitHubRepoPicker
            id="briefing-repo-picker"
            onConfirm={async (selection, repos) => {
              const resolvedRepos = resolveSelectedRepos(selection, repos);
              if (resolvedRepos.length === 0) {
                return { success: false, error: "Select at least one repo to continue." };
              }
              setSelectedRepos(resolvedRepos);
              setStep(nextStepAfterRepos());
              return { success: true };
            }}
          />
        </div>
      );
    }

    if (step === "slack") {
      if (integrationStatus && !slackMentionsAvailable && !slackBotAvailable) {
        return (
          <div className="flex flex-col gap-3 text-[11px] text-muted-foreground">
            <div>
              Slack isn&apos;t connected yet. Skipping Slack setup for now.
            </div>
            <Button size="sm" variant="secondary" onClick={() => setStep(nextStepAfterSlack())}>
              Continue
            </Button>
          </div>
        );
      }

      if (!slackMentionsAvailable && slackBotAvailable) {
        return (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] text-muted-foreground">
              (Optional) Choose Slack channels to monitor activity.
            </div>
            <SlackChannelPicker
              id="briefing-slack-channel-picker"
              selectionMode="multi"
              allowAll
              onConfirm={async (selection, channels) => {
                const resolvedChannels = resolveSelectedChannels(selection, channels);
                setSelectedSlackChannels(resolvedChannels);
                setStep(nextStepAfterSlack());
                return { success: true };
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedSlackChannels([]);
                setStep(nextStepAfterSlack());
              }}
            >
              Skip Slack
            </Button>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-muted-foreground">
            (Optional) Choose which Slack user to track for mentions.
          </div>
          <SlackMentionsPicker
            id="briefing-slack-picker"
            onConfirm={async (selection, users) => {
              const resolvedUsers = resolveSelectedUsers(selection, users);
              setSelectedSlackUser(resolvedUsers[0] ?? null);
              setSelectedSlackChannels([]);
              setStep(nextStepAfterSlack());
              return { success: true };
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedSlackUser(null);
              setSelectedSlackChannels([]);
              setStep(nextStepAfterSlack());
            }}
          >
            Skip Slack
          </Button>
        </div>
      );
    }

    if (step === "vercel") {
      if (integrationStatus && !vercelAvailable) {
        return (
          <div className="flex flex-col gap-3 text-[11px] text-muted-foreground">
            <div>
              Vercel isn&apos;t connected yet. Skipping deployments for now.
            </div>
            <Button size="sm" variant="secondary" onClick={() => setStep("confirm")}>
              Continue
            </Button>
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-muted-foreground">
            (Optional) Choose a Vercel project to monitor deployments.
          </div>
          <VercelProjectPicker
            id="briefing-vercel-picker"
            onConfirm={async (selection, projects) => {
              const resolvedProjects = resolveSelectedProjects(selection, projects);
              setSelectedProject(resolvedProjects[0] ?? null);
              setStep("confirm");
              return { success: true };
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedProject(null);
              setStep("confirm");
            }}
          >
            Skip Vercel
          </Button>
        </div>
      );
    }

    if (step === "confirm") {
      return (
        <div className="flex flex-col gap-3 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            <span className="text-foreground font-medium">Summary</span>
            <span>Repos: {selectedRepos.map((repo) => repo.fullName).join(", ")}</span>
            <span>
              Slack: {selectedSlackUser
                ? `Mentions for ${selectedSlackUser.displayName ?? selectedSlackUser.userId}`
                : selectedSlackChannels.length > 0
                  ? `Channels (${selectedSlackChannels.map((c) => `#${c.name}`).join(", ")})`
                  : "Skipped"}
            </span>
            <span>
              Vercel project: {selectedProject ? selectedProject.name : "Skipped"}
            </span>
          </div>
          {error ? (
            <div className="text-[11px] text-red-600 whitespace-pre-wrap">{error}</div>
          ) : null}
          <Button size="sm" onClick={handleCreateBriefing} disabled={creating}>
            {creating ? "Creating..." : "Create Morning Briefing"}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
        <div>Briefing space created.</div>
        {error ? <div className="text-red-600 whitespace-pre-wrap">{error}</div> : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 text-xs bg-muted/50 rounded px-2 py-1.5 my-1">
      <div className="flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-amber-500" />
        <span>Generate morning briefing</span>
        <ToolStatus status={status} needsInput={!resolved} resolved={resolved} />
      </div>
      {renderStep()}
    </div>
  );
};

export const GenerateBriefingTool = makeAssistantTool({
  ...generateBriefingToolDef,
  toolName: "generate_briefing",
  render: GenerateBriefingToolUI,
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
  execute: async (args) =>
    withToolTelemetry("create_space", { args }, async () => {
      const { name, components, switch_to } = args;
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
        if (switch_to) {
          setTimeout(() => {
            syncSpaceRoute(spaceId);
          }, 0);
        }

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
    }),
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
  execute: async (args) =>
    withToolTelemetry("switch_space", { args }, async () => {
      const { space } = args;
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
        setTimeout(() => {
          syncSpaceRoute(targetSpace.id);
        }, 0);

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
    }),
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
  execute: async (args) =>
    withToolTelemetry("pin_space", { args }, async () => {
      const { space } = args;
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
    }),
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
  execute: async (args) =>
    withToolTelemetry("unpin_space", { args }, async () => {
      const { space } = args;
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
    }),
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
      <SetPreferenceRulesTool />
      <LookupSlackUserTool />
      <AddFilteredComponentTool />
      <GenerateTemplateTool />
      <GenerateBriefingTool />
      <CreateSpaceTool />
      <SwitchSpaceTool />
      <PinSpaceTool />
      <UnpinSpaceTool />
    </>
  );
}
