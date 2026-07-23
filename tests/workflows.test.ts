import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runBenchmark } from "../src/benchmark.js";
import { runQualityGates } from "../src/gates.js";
import { createHandoff, latestCheckFromMetrics, summarizeMetrics } from "../src/workflows.js";
import type { TerseForgeConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

describe("quality and measurement workflows", () => {
  it("fails closed when a required quality gate fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-gates-"));
    const config: TerseForgeConfig = {
      schemaVersion: 1,
      preset: "safe",
      telemetry: false,
      context: { budgetTokens: 1_200, maxFileBytes: 200_000 },
      output: { artifactRetentionDays: 30 },
      qualityGates: [
        {
          name: "passing",
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
          required: true,
          timeoutMs: 5_000
        },
        {
          name: "failing",
          command: process.execPath,
          args: ["-e", "console.error('error: gate failed'); process.exit(2)"],
          required: true,
          timeoutMs: 5_000
        }
      ]
    };

    const result = await runQualityGates(root, config);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[1]).toMatchObject({ name: "failing", exitCode: 2, required: true });
  });

  it("reports an optional gate failure without failing the whole check", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-gates-optional-"));
    const config: TerseForgeConfig = {
      schemaVersion: 1,
      preset: "safe",
      telemetry: false,
      context: { budgetTokens: 1_200, maxFileBytes: 200_000 },
      output: { artifactRetentionDays: 30 },
      qualityGates: [
        {
          name: "advisory",
          command: process.execPath,
          args: ["-e", "process.exit(2)"],
          required: false,
          timeoutMs: 5_000
        }
      ]
    };

    const result = await runQualityGates(root, config);

    expect(result).toMatchObject({ ok: true, configured: true });
    expect(result.results[0]).toMatchObject({ name: "advisory", required: false, status: "failed", exitCode: 2 });
  });

  it("never passes when no quality gates are configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-gates-empty-"));
    const config: TerseForgeConfig = {
      schemaVersion: 1,
      preset: "safe",
      telemetry: false,
      context: { budgetTokens: 1_200, maxFileBytes: 200_000 },
      output: { artifactRetentionDays: 30 },
      qualityGates: []
    };

    const result = await runQualityGates(root, config);

    expect(result).toMatchObject({ ok: false, configured: false, results: [] });
  });

  it("marks a missing package script as not configured even with --if-present", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-gates-missing-script-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: {} }), "utf8");
    const config: TerseForgeConfig = {
      schemaVersion: 1,
      preset: "safe",
      telemetry: false,
      context: { budgetTokens: 1_200, maxFileBytes: 200_000 },
      output: { artifactRetentionDays: 30 },
      qualityGates: [
        { name: "typecheck", command: "npm", args: ["run", "typecheck", "--if-present"], required: true, timeoutMs: 5_000 }
      ]
    };

    const result = await runQualityGates(root, config);

    expect(result.ok).toBe(false);
    expect(result.results[0]).toMatchObject({ name: "typecheck", required: true, status: "not_configured", exitCode: null });
  });

  it("recognizes npm test shorthand as a package-script gate", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-gates-npm-test-"));
    const config: TerseForgeConfig = {
      schemaVersion: 1,
      preset: "safe",
      telemetry: false,
      context: { budgetTokens: 1_200, maxFileBytes: 200_000 },
      output: { artifactRetentionDays: 30 },
      qualityGates: [{ name: "test", command: "npm", args: ["test", "--if-present"], required: true, timeoutMs: 5_000 }]
    };

    const result = await runQualityGates(root, config);

    expect(result.results[0]).toMatchObject({ name: "test", status: "not_configured", exitCode: null });
  });

  it("runs a deterministic pruning benchmark with explicit scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-bench-"));
    const result = await runBenchmark(root);
    const baseline = JSON.parse(await readFile(join(process.cwd(), "benchmarks", "baseline-v0.1.json"), "utf8")) as {
      conditions: typeof result.conditions;
    };

    expect(result.scope).toBe("tool-output-pruning-only");
    expect(result.conditions.map((condition) => condition.preset)).toEqual(["safe", "lean", "ultra"]);
    expect(result.conditions.every((condition) => condition.diagnosticsRetained)).toBe(true);
    expect(result.conditions.every((condition) => condition.rawRecoverable)).toBe(true);
    expect(result.conditions).toEqual(baseline.conditions);
  });

  it("summarizes local metrics and writes a deterministic handoff", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-handoff-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" }),
      "utf8"
    );
    const summary = summarizeMetrics([
      {
        schemaVersion: 1,
        id: "one",
        kind: "exec",
        preset: "safe",
        command: "node",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 1,
        rawBytes: 100,
        rawLines: 10,
        visibleBytes: 50,
        visibleLines: 5,
        omittedLines: 5,
        estimatedInputTokens: 25,
        estimatedVisibleTokens: 13
      }
    ]);
    const handoffPath = await createHandoff(root, "Ship the fixture", []);
    const handoff = await readFile(handoffPath, "utf8");

    expect(summary.savedBytes).toBe(50);
    expect(summary.reductionPercent).toBe(50);
    expect(handoff).toContain("Ship the fixture");
    expect(handoff).toContain("Quality gates: no runs recorded");
  });

  it("handles empty metrics and records changed files plus passed, failed, and optional gates", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-handoff-git-"));
    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "Fixture"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "before\n", "utf8");
    await execFileAsync("git", ["add", "tracked.txt"], { cwd: root });
    await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "after\n", "utf8");

    const summary = summarizeMetrics([]);
    const target = await createHandoff(root, "", [
      { name: "typecheck", required: true, status: "passed", checkId: "check_one", exitCode: 0, output: "", runId: "one" },
      { name: "lint", required: true, status: "failed", checkId: "check_one", exitCode: 1, output: "", runId: "two" },
      { name: "advisory", required: false, status: "failed", checkId: "check_one", exitCode: 1, output: "", runId: "three" }
    ]);
    const handoff = await readFile(target, "utf8");

    expect(summary).toMatchObject({ runs: 0, reductionPercent: 0, savedBytes: 0 });
    expect(handoff).toContain("Objective: Not provided");
    expect(handoff).toContain("tracked.txt");
    expect(handoff).toContain("typecheck: passed [required]");
    expect(handoff).toContain("lint: failed (1) [required]");
    expect(handoff).toContain("advisory: failed (1)");
  });

  it("selects only the latest complete check and ignores ambiguous legacy gate metrics", () => {
    const base = {
      schemaVersion: 1 as const,
      kind: "gate" as const,
      preset: "safe" as const,
      command: "npm",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      rawBytes: 0,
      rawLines: 0,
      visibleBytes: 0,
      visibleLines: 0,
      omittedLines: 0,
      estimatedInputTokens: 0,
      estimatedVisibleTokens: 0
    };
    const latest = latestCheckFromMetrics([
      { ...base, id: "legacy" },
      {
        ...base,
        id: "old-test",
        checkId: "check_old",
        checkGateIndex: 0,
        checkGateCount: 1,
        checkCompleted: true,
        gateName: "test",
        gateRequired: true,
        gateStatus: "passed"
      },
      {
        ...base,
        id: "new-lint",
        checkId: "check_new",
        checkGateIndex: 0,
        checkGateCount: 2,
        gateName: "lint",
        gateRequired: false,
        gateStatus: "failed",
        exitCode: 2
      },
      {
        ...base,
        id: "new-test",
        checkId: "check_new",
        checkGateIndex: 1,
        checkGateCount: 2,
        checkCompleted: true,
        gateName: "test",
        gateRequired: true,
        gateStatus: "passed"
      }
    ]);

    expect(latest?.checkId).toBe("check_new");
    expect(latest?.results.map((gate) => gate.name)).toEqual(["lint", "test"]);
    expect(latest?.results[0]).toMatchObject({ required: false, status: "failed", exitCode: 2 });
  });

  it("rejects incomplete and invalid check groups instead of presenting them as verified", () => {
    const metric = {
      schemaVersion: 1 as const,
      id: "partial",
      kind: "gate" as const,
      preset: "safe" as const,
      command: "npm",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 1,
      rawBytes: 0,
      rawLines: 0,
      visibleBytes: 0,
      visibleLines: 0,
      omittedLines: 0,
      estimatedInputTokens: 0,
      estimatedVisibleTokens: 0,
      checkId: "check_partial",
      checkGateIndex: 0,
      checkGateCount: 2,
      checkCompleted: true,
      gateName: "test",
      gateRequired: true,
      gateStatus: "passed" as const
    };

    expect(latestCheckFromMetrics([metric])).toBeUndefined();
    expect(latestCheckFromMetrics([{ ...metric, gateStatus: "invented" as "passed" }])).toBeUndefined();
    expect(
      latestCheckFromMetrics([
        { ...metric, id: "old", checkId: "check_old", checkGateCount: 1, checkCompleted: true },
        { ...metric, id: "new", checkId: "check_new", checkCompleted: false }
      ])
    ).toBeUndefined();
  });

  it("reports visible-output overhead instead of hiding it as zero savings", () => {
    const summary = summarizeMetrics([
      {
        schemaVersion: 1,
        id: "overhead",
        kind: "exec",
        preset: "safe",
        command: "node",
        exitCode: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        durationMs: 1,
        rawBytes: 10,
        rawLines: 1,
        visibleBytes: 20,
        visibleLines: 2,
        omittedLines: 0,
        estimatedInputTokens: 3,
        estimatedVisibleTokens: 5
      }
    ]);

    expect(summary.savedBytes).toBe(-10);
    expect(summary.reductionPercent).toBe(-100);
  });
});
