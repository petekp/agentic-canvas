import { describe, expect, it, vi } from "vitest";
import { loadPromptDoc } from "@/lib/prompt-docs";

describe("loadPromptDoc", () => {
  it("loads markdown prompt content from the repository", () => {
    const content = loadPromptDoc(
      "docs/prompts/rules-score-system.md",
      "fallback value"
    );

    expect(content).toContain("You are a precise classifier.");
    expect(content).not.toBe("fallback value");
  });

  it("uses fallback content when a prompt file is missing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fallback = "missing prompt fallback";
    const content = loadPromptDoc(
      "docs/prompts/does-not-exist.md",
      fallback
    );

    expect(content).toBe(fallback);
    warnSpy.mockRestore();
  });
});
