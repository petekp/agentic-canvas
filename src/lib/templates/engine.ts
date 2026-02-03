import type {
  CanvasCommand,
  CanvasContext,
  ComponentMeta,
  DataBinding,
  GenerationIntent,
  Normalized,
  StateSnapshot,
  TemplateComponentOutput,
  TemplateDefinition,
  TemplateInstanceMeta,
  TemplateParamDefinition,
} from "@/types";
import { evaluateCondition } from "./conditions";

export interface IntentDerivationOptions {
  idPrefix?: string;
}

function mapModeToCategory(mode: StateSnapshot["mode"]): GenerationIntent["category"] {
  switch (mode) {
    case "execute":
      return "focus";
    case "review":
      return "review";
    case "explore":
      return "explore";
    case "recover":
      return "recover";
    case "monitor":
      return "monitor";
    default:
      return "focus";
  }
}

function derivePriority(timePressure: Normalized): GenerationIntent["priority"] {
  if (timePressure >= 0.7) return "high";
  if (timePressure >= 0.4) return "medium";
  return "low";
}

export function deriveIntent(
  state: StateSnapshot,
  _context: CanvasContext,
  options: IntentDerivationOptions = {}
): GenerationIntent {
  const category = mapModeToCategory(state.mode);
  const priority = derivePriority(state.timePressure);
  const idPrefix = options.idPrefix ?? "intent";

  return {
    id: `${idPrefix}_${category}_${priority}`,
    label: `${category} (${priority})`,
    category,
    priority,
    reason: `Mode=${state.mode}, timePressure=${state.timePressure.toFixed(2)}`,
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deriveSeed(
  templateId: string,
  intent: GenerationIntent,
  state: StateSnapshot
): number {
  const payload = {
    templateId,
    intentId: intent.id,
    state: {
      focus: state.focus,
      energy: state.energy,
      stress: state.stress,
      timePressure: state.timePressure,
      interruptibility: state.interruptibility,
      ambientLight: state.ambientLight,
      noiseLevel: state.noiseLevel,
      motionContext: state.motionContext,
      mode: state.mode,
      timezone: state.timezone,
    },
  };

  return hashString(JSON.stringify(payload));
}

export interface ParameterResolutionResult {
  params: Record<string, unknown>;
  issues: string[];
}

function validateParam(definition: TemplateParamDefinition, value: unknown): string | null {
  if (definition.enumValues && typeof value === "string") {
    if (!definition.enumValues.includes(value)) {
      return `Param ${definition.key} not in enum: ${value}`;
    }
  }

  if (typeof value === "number") {
    if (definition.min !== undefined && value < definition.min) {
      return `Param ${definition.key} below min: ${value}`;
    }
    if (definition.max !== undefined && value > definition.max) {
      return `Param ${definition.key} above max: ${value}`;
    }
  }

  return null;
}

export function resolveTemplateParams(
  definitions: TemplateParamDefinition[],
  state: StateSnapshot,
  context: CanvasContext,
  overrides: Record<string, unknown> = {}
): ParameterResolutionResult {
  const params: Record<string, unknown> = {};
  const issues: string[] = [];

  for (const definition of definitions) {
    let value: unknown = overrides[definition.key];

    if (value === undefined && definition.suggested) {
      value = definition.suggested(state, context);
    }

    if (value === undefined && definition.default !== undefined) {
      value = definition.default;
    }

    if (value === undefined) {
      if (definition.required) {
        issues.push(`Missing required param: ${definition.key}`);
      }
      continue;
    }

    const validationError = validateParam(definition, value);
    if (validationError) {
      issues.push(validationError);
      if (definition.default !== undefined) {
        params[definition.key] = definition.default;
      }
      continue;
    }

    params[definition.key] = value;
  }

  return { params, issues };
}

export interface CompileTemplateOptions {
  template: TemplateDefinition;
  intent: GenerationIntent;
  state: StateSnapshot;
  context: CanvasContext;
  overrides?: Record<string, unknown>;
  defaultBindings?: (typeId: string) => DataBinding | undefined;
  createdBy?: ComponentMeta["createdBy"];
  generatedAt?: number;
}

export interface CompileTemplateResult {
  command: CanvasCommand;
  meta: TemplateInstanceMeta;
  params: Record<string, unknown>;
  issues: string[];
  outputs: TemplateComponentOutput[];
}

function applyParamsToValue(
  value: unknown,
  params: Record<string, unknown>,
  issues: string[],
  path: string
): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const key = value.slice(1);
    if (key in params) {
      return params[key];
    }
    issues.push(`Missing param "${key}" for ${path}`);
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      applyParamsToValue(entry, params, issues, `${path}[${index}]`)
    );
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      const nextPath = path ? `${path}.${entryKey}` : entryKey;
      result[entryKey] = applyParamsToValue(entryValue, params, issues, nextPath);
    }
    return result;
  }

  return value;
}

function applyParamsToConfig(
  config: Record<string, unknown>,
  params: Record<string, unknown>,
  issues: string[]
): Record<string, unknown> {
  return applyParamsToValue(config, params, issues, "config") as Record<string, unknown>;
}

function applyParamsToBinding(
  binding: DataBinding,
  params: Record<string, unknown>,
  issues: string[]
): DataBinding {
  return applyParamsToValue(binding, params, issues, "dataBinding") as DataBinding;
}

function resolveOutputs(
  template: TemplateDefinition,
  defaultBindings?: (typeId: string) => DataBinding | undefined
): TemplateComponentOutput[] {
  if (template.output.components && template.output.components.length > 0) {
    return template.output.components.map((output) => ({
      ...output,
      dataBinding: output.dataBinding ?? defaultBindings?.(output.typeId),
    }));
  }

  if (template.output.primaryTypeId) {
    return [
      {
        typeId: template.output.primaryTypeId,
        config: {},
        dataBinding: defaultBindings?.(template.output.primaryTypeId),
      },
    ];
  }

  return [];
}

export function compileTemplateToCommands(options: CompileTemplateOptions): CompileTemplateResult {
  const { template, intent, state, context, overrides, defaultBindings, createdBy, generatedAt } =
    options;
  const { params, issues } = resolveTemplateParams(template.parameters, state, context, overrides);
  const seed = deriveSeed(template.id, intent, state);
  const resolvedOutputs = resolveOutputs(template, defaultBindings);

  if (resolvedOutputs.length === 0) {
    issues.push(`Template ${template.id} has no outputs`);
  }

  const meta: TemplateInstanceMeta = {
    templateId: template.id,
    templateVersion: template.version,
    seed,
    resolvedParams: params,
    intentId: intent.id,
    generatedAt: generatedAt ?? Date.now(),
  };

  const commands: CanvasCommand[] = resolvedOutputs.map((output, index) => {
    const resolvedConfig = applyParamsToConfig(output.config ?? {}, params, issues);
    const resolvedBinding = output.dataBinding
      ? applyParamsToBinding(output.dataBinding, params, issues)
      : undefined;
    const resolvedMeta = applyParamsToValue(
      output.meta ?? {},
      params,
      issues,
      `meta[${index}]`
    ) as ComponentMeta;

    return {
      type: "component.create",
      payload: {
        typeId: output.typeId,
        config: resolvedConfig,
        dataBinding: resolvedBinding,
        position: output.position,
        size: output.size,
        meta: {
          ...resolvedMeta,
          createdBy: resolvedMeta?.createdBy ?? createdBy ?? "assistant",
          template: meta,
        },
      },
    };
  });

  const command: CanvasCommand =
    commands.length <= 1
      ? (commands[0] ?? { type: "batch", payload: { commands: [], description: "Empty" } })
      : {
          type: "batch",
          payload: {
            commands,
            description: `Generate ${template.id}`,
          },
        };

  return {
    command,
    meta,
    params,
    issues,
    outputs: resolvedOutputs,
  };
}

export function shouldRenderNode(
  when: TemplateDefinition["root"]["when"],
  state: StateSnapshot,
  context: CanvasContext,
  intent?: GenerationIntent,
  params?: Record<string, unknown>
): boolean {
  if (!when) return true;
  return evaluateCondition(when, { state, context, intent, params });
}
