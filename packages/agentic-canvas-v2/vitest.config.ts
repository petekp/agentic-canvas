import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/agentic-canvas-v2/tests/**/*.test.ts"],
  },
});
