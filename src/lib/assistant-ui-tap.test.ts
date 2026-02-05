import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("@assistant-ui/tap patching", () => {
  it("does not throw on repeated unmounts (patch applied)", () => {
    const tapEntry = require.resolve("@assistant-ui/tap");
    const fiberPath = path.join(path.dirname(tapEntry), "core", "ResourceFiber.js");
    const source = fs.readFileSync(fiberPath, "utf8");

    expect(source).not.toContain("Tried to unmount a fiber that is already unmounted");
  });
});
