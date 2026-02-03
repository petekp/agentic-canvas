import { describe, expect, it } from "vitest";
import type {
  CanvasContext,
  GenerationIntent,
  StateSnapshot,
  TemplateDefinition,
  TemplateParamDefinition,
} from "@/types";
import { compileTemplateToCommands, deriveIntent, resolveTemplateParams } from "./engine";
import { selectTopTemplate } from "./selection";

const baseState: StateSnapshot = {
  timestamp: 0,
  timezone: "UTC",
  focus: 0.8,
  energy: 0.6,
  stress: 0.3,
  timePressure: 0.8,
  interruptibility: 0.2,
  ambientLight: "normal",
  noiseLevel: "quiet",
  motionContext: "still",
  mode: "execute",
  signals: [],
};

const baseContext: CanvasContext = {
  components: [],
  temporal: {
    timestamp: "2026-02-03T00:00:00Z",
    timezone: "UTC",
    dayOfWeek: "tuesday",
    timeOfDay: "morning",
    isWorkHours: true,
  },
  workspace: {
    id: "ws_1",
    name: "Test",
    activeViewId: null,
    savedViews: [],
    componentCount: 0,
    gridUtilization: 0,
  },
  budget: {
    maxTokens: 4000,
    usedTokens: 0,
    maxComponents: 20,
    summarizationLevel: "full",
  },
};

const focusTemplate: TemplateDefinition = {
  id: "focus/triage/v1",
  version: "1.0.0",
  name: "Focus Triage",
  description: "Focus on urgent items",
  category: "focus",
  parameters: [],
  root: { id: "root", type: "stack" },
  output: { primaryTypeId: "github.pr-list" },
  constraints: {},
  selection: {
    baseScore: 0.1,
    rules: [
      {
        when: { op: "gt", left: "state.focus", right: 0.7 },
        weight: 0.8,
        reason: "Focused state",
      },
    ],
  },
};

const reviewTemplate: TemplateDefinition = {
  id: "review/weekly/v1",
  version: "1.0.0",
  name: "Weekly Review",
  description: "Review layout",
  category: "review",
  parameters: [],
  root: { id: "root", type: "stack" },
  output: { primaryTypeId: "github.issue-grid" },
  constraints: {},
  selection: {
    baseScore: 0.4,
    rules: [],
  },
};

describe("template selection", () => {
  it("selects the highest scoring template in a category", () => {
    const top = selectTopTemplate(
      [focusTemplate, reviewTemplate],
      baseState,
      baseContext,
      { category: "focus" }
    );

    expect(top?.template.id).toBe("focus/triage/v1");
    expect(top?.score).toBeCloseTo(0.9);
    expect(top?.reasons).toContain("Focused state");
  });
});

describe("parameter resolution", () => {
  it("prefers overrides then suggested then defaults, validating values", () => {
    const definitions: TemplateParamDefinition[] = [
      {
        key: "limit",
        type: "number",
        default: 5,
        min: 1,
        max: 10,
      },
      {
        key: "density",
        type: "enum",
        enumValues: ["compact", "normal"],
        default: "normal",
      },
      {
        key: "mode",
        type: "string",
        required: true,
        suggested: () => "auto",
      },
    ];

    const result = resolveTemplateParams(definitions, baseState, baseContext, {
      limit: 20,
      density: "invalid",
    });

    expect(result.params.limit).toBe(5);
    expect(result.params.density).toBe("normal");
    expect(result.params.mode).toBe("auto");
    expect(result.issues.length).toBe(2);
  });
});

describe("template compilation", () => {
  it("compiles a template into component.create commands with template metadata", () => {
    const template: TemplateDefinition = {
      id: "monitor/summary/v1",
      version: "1.0.0",
      name: "Summary",
      description: "Monitor summary",
      category: "monitor",
      parameters: [
        { key: "limit", type: "number", default: 5 },
        { key: "repo", type: "string", default: "assistant-ui/assistant-ui" },
      ],
      root: { id: "root", type: "stack" },
      output: {
        components: [
          {
            typeId: "github.pr-list",
            config: { repo: "$repo", limit: "$limit" },
          },
        ],
      },
      constraints: {},
      selection: {
        rules: [],
      },
    };

    const intent: GenerationIntent = deriveIntent({ ...baseState, mode: "monitor" }, baseContext);

    const result = compileTemplateToCommands({
      template,
      intent,
      state: baseState,
      context: baseContext,
      overrides: { repo: "example/repo", limit: 7 },
      generatedAt: 1234,
      defaultBindings: () => ({
        source: "mock-github",
        query: { type: "pull_requests", params: {} },
        refreshInterval: 60000,
      }),
    });

    expect(result.command.type).toBe("component.create");
    if (result.command.type !== "component.create") {
      throw new Error("Expected component.create command");
    }

    expect(result.command.payload.dataBinding?.source).toBe("mock-github");
    expect(result.command.payload.meta?.template?.templateId).toBe("monitor/summary/v1");
    expect(result.command.payload.meta?.template?.generatedAt).toBe(1234);
    expect(result.command.payload.config.repo).toBe("example/repo");
    expect(result.command.payload.config.limit).toBe(7);
  });
});
