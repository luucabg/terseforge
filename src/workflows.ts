import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GateResult } from "./gates.js";
import { ensureStateDirectories, statePath, type RunMetric } from "./storage.js";

const execFileAsync = promisify(execFile);

export interface MetricsSummary {
  runs: number;
  rawBytes: number;
  visibleBytes: number;
  savedBytes: number;
  reductionPercent: number;
  failedRuns: number;
  durationMs: number;
}

export function summarizeMetrics(metrics: RunMetric[]): MetricsSummary {
  const rawBytes = metrics.reduce((total, metric) => total + metric.rawBytes, 0);
  const visibleBytes = metrics.reduce((total, metric) => total + metric.visibleBytes, 0);
  return {
    runs: metrics.length,
    rawBytes,
    visibleBytes,
    savedBytes: rawBytes - visibleBytes,
    reductionPercent: rawBytes === 0 ? 0 : Number((((rawBytes - visibleBytes) / rawBytes) * 100).toFixed(2)),
    failedRuns: metrics.filter((metric) => metric.exitCode !== 0).length,
    durationMs: metrics.reduce((total, metric) => total + metric.durationMs, 0)
  };
}

async function gitLines(root: string, args: string[]): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
    return stdout.split(/\r?\n/u).filter(Boolean);
  } catch {
    return [];
  }
}

export async function createHandoff(root: string, objective: string, gateResults: GateResult[]): Promise<string> {
  await ensureStateDirectories(root);
  const [status, diffStat] = await Promise.all([gitLines(root, ["status", "--short"]), gitLines(root, ["diff", "--stat"])]);
  const gateLines =
    gateResults.length === 0
      ? ["Quality gates: no runs recorded"]
      : gateResults.map((gate) => `- ${gate.name}: ${gate.exitCode === 0 ? "passed" : `failed (${gate.exitCode})`}${gate.required ? " [required]" : ""}`);
  const content = [
    "# TerseForge handoff",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Objective: ${objective.trim() || "Not provided"}`,
    "",
    "## Working tree",
    "",
    ...(status.length > 0 ? status.map((line) => `- ${line}`) : ["- Clean or not a Git repository"]),
    "",
    "## Diff summary",
    "",
    ...(diffStat.length > 0 ? diffStat.map((line) => `- ${line}`) : ["- No unstaged diff"]),
    "",
    "## Verification",
    "",
    ...gateLines,
    ""
  ].join("\n");
  const target = join(statePath(root), "handoff.md");
  await writeFile(target, content, "utf8");
  return target;
}
