import { describe, expect, it } from "vitest";
import { pruneText } from "../src/pruning.js";

const noisyOutput = [
  "starting test run",
  ...Array.from({ length: 120 }, (_, index) => `progress ${index}`),
  "src/auth.ts:18:4 warning token expiry is short",
  "src/auth.ts:22:7 error TS2322: Type 'number' is not assignable to type 'string'",
  "src/auth.ts:22:7 error TS2322: Type 'number' is not assignable to type 'string'",
  ...Array.from({ length: 80 }, (_, index) => `trace ${index}`),
  "Tests: 1 failed, 9 passed"
].join("\n");

describe("recoverable output pruning", () => {
  it.each(["safe", "lean", "ultra"] as const)("protects diagnostics in %s mode", (preset) => {
    const result = pruneText(noisyOutput, preset);

    expect(result.text).toContain("warning token expiry is short");
    expect(result.text).toContain("error TS2322");
    expect(result.text).toContain("1 failed");
    expect(result.omittedLines).toBeGreaterThan(0);
    expect(result.visibleLines).toBeLessThan(result.rawLines);
  });

  it("is most conservative in safe mode", () => {
    const safe = pruneText(noisyOutput, "safe");
    const lean = pruneText(noisyOutput, "lean");
    const ultra = pruneText(noisyOutput, "ultra");

    expect(safe.visibleLines).toBeGreaterThan(lean.visibleLines);
    expect(lean.visibleLines).toBeGreaterThan(ultra.visibleLines);
  });

  it("reports exact duplicate diagnostics without erasing their meaning", () => {
    const result = pruneText(noisyOutput, "lean");

    expect(result.text).toMatch(/error TS2322.*repeated 2x/);
  });
});
