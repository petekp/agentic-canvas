import { describe, expect, it } from "vitest";
import type { CommandResult } from "@/types";
import { summarizeGenerationResults } from "./execution";

const successResult: CommandResult = {
  success: true,
  undoId: "cmp_1",
  explanation: "Added component",
  affectedComponentIds: ["cmp_1"],
};

const failureResult: CommandResult = {
  success: false,
  undoId: "",
  explanation: "Component not found",
  affectedComponentIds: [],
  error: { code: "COMPONENT_NOT_FOUND", message: "Component not found" },
};

describe("summarizeGenerationResults", () => {
  it("returns success when all components created", () => {
    const summary = summarizeGenerationResults({
      results: [successResult, { ...successResult, affectedComponentIds: ["cmp_2"] }],
      templateName: "Test Template",
      reasons: ["Reason A"],
      issues: [],
    });

    expect(summary.success).toBe(true);
    expect(summary.createdCount).toBe(2);
    expect(summary.message).toContain("Test Template");
  });

  it("returns failure when no components created", () => {
    const summary = summarizeGenerationResults({
      results: [failureResult],
      templateName: "Test Template",
      reasons: [],
      issues: [],
    });

    expect(summary.success).toBe(false);
    expect(summary.createdCount).toBe(0);
    expect(summary.error).toContain("No components were created");
  });

  it("returns failure when any command fails", () => {
    const summary = summarizeGenerationResults({
      results: [successResult, failureResult],
      templateName: "Test Template",
      reasons: [],
      issues: ["Param missing"],
    });

    expect(summary.success).toBe(false);
    expect(summary.error).toContain("Component not found");
    expect(summary.error).toContain("Notes: Param missing");
  });
});
