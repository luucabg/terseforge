import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCli } from "../src/cli-program.js";
import { createDefaultConfig, writeConfig } from "../src/config.js";

async function runCli(root: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const cli = createCli({
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });
  await cli.parseAsync(["--cwd", root, ...args], { from: "user" });
  return { stdout, stderr };
}

afterEach(() => {
  process.exitCode = undefined;
});

describe("CLI end-to-end workflow", () => {
  it("initializes, selects context, executes, recovers, verifies, measures, benchmarks, and hands off", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-cli-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "cli-fixture",
        private: true,
        scripts: {
          typecheck: "node -e \"process.exit(0)\"",
          lint: "node -e \"process.exit(0)\"",
          test: "node -e \"process.exit(0)\"",
          build: "node -e \"process.exit(0)\""
        }
      }),
      "utf8"
    );
    await writeFile(
      join(root, "auth.ts"),
      'export function validateToken(token: string): string {\n  return token;\n}\n',
      "utf8"
    );

    const initialized = await runCli(root, ["init", "--install", "codex", "claude"]);
    const doctor = await runCli(root, ["doctor"]);
    const map = await runCli(root, ["map"]);
    const jsonMap = await runCli(root, ["map", "--json"]);
    const context = await runCli(root, ["context", "token", "validation", "--symbol", "validateToken", "--budget", "200"]);
    const executed = await runCli(root, ["exec", process.execPath, "-e", "console.log('ok'); console.error('warning: retained')"]);
    const runId = /terseforge output ([a-zA-Z0-9_-]+)/u.exec(executed.stdout)?.[1];
    expect(runId).toBeDefined();
    if (!runId) throw new Error("exec did not return a recovery identifier");
    const recovered = await runCli(root, ["output", runId, "--lines", "1:2"]);
    const checked = await runCli(root, ["check"]);
    const stats = await runCli(root, ["stats"]);
    const statsJson = await runCli(root, ["stats", "--json"]);
    const bench = await runCli(root, ["bench"]);
    const benchJson = await runCli(root, ["bench", "--json"]);
    const handoff = await runCli(root, ["handoff", "Ship", "fixture"]);

    expect(initialized.stdout).toContain("terseforge.config.json");
    expect(doctor.stdout).toContain("PASS Node.js >=22");
    expect(map.stdout).toContain("validateToken");
    expect(JSON.parse(jsonMap.stdout)).toMatchObject({ files: [expect.objectContaining({ path: "auth.ts" })] });
    expect(context.stdout).toContain("1: export function validateToken");
    expect(executed.stdout).toContain("warning: retained");
    expect(recovered.stdout).toContain("ok");
    expect(checked.stdout).toContain("## test (passed)");
    expect(stats.stdout).toContain("Runs:");
    expect(JSON.parse(statsJson.stdout)).toMatchObject({ failedRuns: 0 });
    expect(bench.stdout).toContain("tool-output-pruning-only");
    expect(JSON.parse(benchJson.stdout)).toMatchObject({ scope: "tool-output-pruning-only" });
    expect(handoff.stdout).toContain("Handoff written:");
    await expect(readFile(join(root, ".terseforge", "handoff.md"), "utf8")).resolves.toContain("Ship fixture");
    expect(process.exitCode).toBeUndefined();
  }, 30_000);

  it("reports conservative no-op and failure paths with non-zero status", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-cli-failure-"));
    const missingDoctor = await runCli(root, ["doctor"]);
    expect(missingDoctor.stdout).toContain("FAIL Configuration");
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;

    await runCli(root, ["init"]);
    const repeatedInit = await runCli(root, ["init"]);
    const emptyContext = await runCli(root, ["context", "nothing-matches"]);
    const failedExec = await runCli(root, ["exec", process.execPath, "-e", "console.error('error: expected'); process.exit(9)"]);
    expect(repeatedInit.stdout).toContain("Created: nothing");
    expect(repeatedInit.stdout).toContain("Preserved existing:");
    expect(emptyContext.stdout).toContain("No relevant TS/JS context found.");
    expect(failedExec.stdout).toContain("error: expected");
    expect(process.exitCode).toBe(9);
    process.exitCode = undefined;

    await writeConfig(root, {
      ...createDefaultConfig(),
      qualityGates: [
        { name: "required-failure", command: process.execPath, args: ["-e", "process.exit(3)"], required: true, timeoutMs: 5_000 }
      ]
    });
    const failedCheck = await runCli(root, ["check"]);
    expect(failedCheck.stdout).toContain("failed: 3");
    expect(process.exitCode).toBe(1);
  });
});
