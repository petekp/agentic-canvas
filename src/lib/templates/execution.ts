import type { CanvasCommand, CommandResult } from "@/types";
import type { AgenticCanvasStore } from "@/store";

export function validateCanvasCommand(command: CanvasCommand): string | null {
  if (command.type === "component.create") return null;
  if (command.type === "batch") {
    const unsupported = command.payload.commands.find((entry) => entry.type !== "component.create");
    return unsupported ? `Unsupported command in batch: ${unsupported.type}` : null;
  }
  return `Unsupported command: ${command.type}`;
}

export function executeCanvasCommand(
  store: AgenticCanvasStore,
  command: CanvasCommand
): CommandResult[] {
  if (command.type === "component.create") {
    return [store.addComponent(command.payload)];
  }

  if (command.type === "batch") {
    return command.payload.commands.map((entry) => {
      if (entry.type !== "component.create") {
        return {
          success: false,
          undoId: "",
          explanation: `Unsupported command in batch: ${entry.type}`,
          affectedComponentIds: [],
        };
      }
      return store.addComponent(entry.payload);
    });
  }

  return [
    {
      success: false,
      undoId: "",
      explanation: `Unsupported command: ${command.type}`,
      affectedComponentIds: [],
    },
  ];
}

export interface GenerationSummary {
  success: boolean;
  createdCount: number;
  message?: string;
  error?: string;
}

export function summarizeGenerationResults(options: {
  results: CommandResult[];
  templateName: string;
  reasons?: string[];
  issues?: string[];
}): GenerationSummary {
  const { results, templateName, reasons = [], issues = [] } = options;
  const createdCount = results.reduce(
    (total, result) => total + (result.affectedComponentIds?.length ?? 0),
    0
  );
  const failures = results.filter((result) => !result.success);

  if (failures.length > 0 || createdCount === 0) {
    const errorParts = [] as string[];
    if (createdCount === 0) {
      errorParts.push("No components were created");
    }
    for (const failure of failures) {
      if (failure.error?.message) {
        errorParts.push(failure.error.message);
      } else if (failure.explanation) {
        errorParts.push(failure.explanation);
      }
    }

    if (issues.length > 0) {
      errorParts.push(`Notes: ${issues.join("; ")}`);
    }

    return {
      success: false,
      createdCount,
      error: errorParts.join("; ") || "Template generation failed",
    };
  }

  const messageParts = [
    `Generated ${createdCount} component${createdCount === 1 ? "" : "s"} from ${templateName}`,
  ];

  if (reasons.length > 0) {
    messageParts.push(`Reason: ${reasons.join("; ")}`);
  }
  if (issues.length > 0) {
    messageParts.push(`Notes: ${issues.join("; ")}`);
  }

  return {
    success: true,
    createdCount,
    message: messageParts.join(". "),
  };
}
