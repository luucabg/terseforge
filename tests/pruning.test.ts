import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPruningAdapter } from "../src/pruning-adapters.js";
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

  it("retains multiline diagnostic context and stack frames", () => {
    const input = [
      ...Array.from({ length: 30 }, (_, index) => `routine ${index}`),
      "Error: request failed",
      "    at validateToken (src/auth.ts:40:7)",
      "    at handleRequest (src/server.ts:18:3)",
      "Received: 401",
      ...Array.from({ length: 30 }, (_, index) => `cleanup ${index}`)
    ].join("\n");

    const result = pruneText(input, "ultra");

    expect(result.text).toContain("Error: request failed");
    expect(result.text).toContain("at validateToken");
    expect(result.text).toContain("at handleRequest");
  });

  it("handles empty output without inventing visible lines", () => {
    expect(pruneText("", "safe")).toMatchObject({ text: "", rawLines: 0, visibleLines: 0, omittedLines: 0 });
  });

  it("retains complete Vitest assertion context beyond the generic three-line window", () => {
    const input = [
      ...Array.from({ length: 30 }, (_, index) => `transform module-${index}.ts`),
      " FAIL  tests/auth.test.ts > validates expired sessions",
      "AssertionError: expected response to deeply equal snapshot",
      "",
      "- Expected",
      "+ Received",
      "",
      "  Object {",
      "-   status: 200,",
      "+   status: 401,",
      "  }",
      "",
      " ❯ tests/auth.test.ts:42:18",
      ...Array.from({ length: 30 }, (_, index) => `cleanup ${index}`)
    ].join("\n");

    const result = pruneText(input, "ultra", { adapter: "vitest" });

    expect(result.text).toContain("- Expected");
    expect(result.text).toContain("+   status: 401");
    expect(result.text).toContain("tests/auth.test.ts:42:18");
  });

  it("normalizes ANSI only for classification and duplicate keys while preserving visible text", () => {
    const colored = "\u001b[31merror TS2322: invalid session\u001b[0m";
    const plain = "error TS2322: invalid session";
    const input = [...Array.from({ length: 20 }, (_, index) => `before ${index}`), colored, plain, ...Array.from({ length: 20 }, (_, index) => `after ${index}`)].join("\n");

    const result = pruneText(input, "lean", { adapter: "typescript" });

    expect(result.text).toContain(colored);
    expect(result.text).toContain("repeated 2x");
  });

  it("does not protect successful zero-failure summaries as diagnostics", () => {
    const input = [
      ...Array.from({ length: 20 }, (_, index) => `before ${index}`),
      "Tests: 0 failed, 150 passed",
      ...Array.from({ length: 20 }, (_, index) => `after ${index}`)
    ].join("\n");

    expect(pruneText(input, "ultra", { adapter: "jest" }).text).not.toContain("Tests: 0 failed");
  });

  it("detects direct tools and package-manager scripts conservatively", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-pruning-adapter-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run", lint: "eslint ." } }), "utf8");

    await expect(detectPruningAdapter(root, "npm", ["test"])).resolves.toBe("vitest");
    await expect(detectPruningAdapter(root, "pnpm", ["run", "lint"])).resolves.toBe("eslint");
    await expect(detectPruningAdapter(root, "npx", ["tsc", "--noEmit"])).resolves.toBe("typescript");
    await expect(detectPruningAdapter(root, process.execPath, ["script.js"])).resolves.toBe("generic");
  });
});
