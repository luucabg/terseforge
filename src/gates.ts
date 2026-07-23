import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { TerseForgeConfig } from "./config.js";
import { runProcess } from "./runner.js";
import { appendMetric, createRunId, type RecordedGateStatus } from "./storage.js";

export type GateStatus = RecordedGateStatus;

export interface GateResult {
  name: string;
  required: boolean;
  status: GateStatus;
  exitCode: number | null;
  output: string;
  runId?: string;
  checkId: string;
}

export interface QualityGateResult {
  ok: boolean;
  configured: boolean;
  checkId: string;
  results: GateResult[];
}

async function recordNoQualityGates(root: string, config: TerseForgeConfig, checkId: string): Promise<void> {
  const output = "No quality gates configured.";
  await appendMetric(root, {
    schemaVersion: 1,
    id: createRunId("gate"),
    kind: "gate",
    preset: config.preset,
    command: "terseforge",
    exitCode: null,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    rawBytes: 0,
    rawLines: 0,
    visibleBytes: Buffer.byteLength(output),
    visibleLines: 1,
    omittedLines: 0,
    estimatedInputTokens: 0,
    estimatedVisibleTokens: Math.ceil(Buffer.byteLength(output) / 4),
    checkId,
    checkGateIndex: 0,
    checkGateCount: 1,
    checkCompleted: true,
    gateName: "quality-gates",
    gateRequired: true,
    gateStatus: "not_configured"
  });
}

function packageScriptName(command: string, args: string[]): string | undefined {
  const executable = basename(command).toLowerCase().replace(/\.(?:cmd|exe)$/u, "");
  if (!["npm", "pnpm", "yarn", "bun"].includes(executable)) return undefined;
  if (args[0] === "run" && args[1]) return args[1];
  if (executable === "npm" && args[0] === "test") return "test";
  return undefined;
}

async function hasPackageScript(root: string, script: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    return (
      parsed.scripts !== undefined &&
      Object.hasOwn(parsed.scripts, script) &&
      typeof parsed.scripts[script] === "string" &&
      parsed.scripts[script].trim().length > 0
    );
  } catch {
    return false;
  }
}

async function recordUnconfiguredGate(
  root: string,
  config: TerseForgeConfig,
  checkId: string,
  gate: TerseForgeConfig["qualityGates"][number],
  script: string,
  gateIndex: number,
  gateCount: number
): Promise<GateResult> {
  const id = createRunId("gate");
  const output = `Package script "${script}" is not configured.`;
  await appendMetric(root, {
    schemaVersion: 1,
    id,
    kind: "gate",
    preset: config.preset,
    command: gate.command,
    exitCode: null,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    rawBytes: 0,
    rawLines: 0,
    visibleBytes: Buffer.byteLength(output),
    visibleLines: 1,
    omittedLines: 0,
    estimatedInputTokens: 0,
    estimatedVisibleTokens: Math.ceil(Buffer.byteLength(output) / 4),
    checkId,
    checkGateIndex: gateIndex,
    checkGateCount: gateCount,
    ...(gateIndex === gateCount - 1 ? { checkCompleted: true } : {}),
    gateName: gate.name,
    gateRequired: gate.required,
    gateStatus: "not_configured"
  });
  return { name: gate.name, required: gate.required, status: "not_configured", exitCode: null, output, checkId };
}

export async function runQualityGates(root: string, config: TerseForgeConfig): Promise<QualityGateResult> {
  const checkId = createRunId("check");
  if (config.qualityGates.length === 0) {
    await recordNoQualityGates(root, config, checkId);
    return { ok: false, configured: false, checkId, results: [] };
  }

  const results: GateResult[] = [];
  for (const [gateIndex, gate] of config.qualityGates.entries()) {
    const script = packageScriptName(gate.command, gate.args);
    if (script && !(await hasPackageScript(root, script))) {
      results.push(await recordUnconfiguredGate(root, config, checkId, gate, script, gateIndex, config.qualityGates.length));
      continue;
    }
    const result = await runProcess({
      root,
      command: gate.command,
      args: gate.args,
      preset: config.preset,
      kind: "gate",
      timeoutMs: gate.timeoutMs,
      checkId,
      checkGateIndex: gateIndex,
      checkGateCount: config.qualityGates.length,
      checkCompleted: gateIndex === config.qualityGates.length - 1,
      gateName: gate.name,
      gateRequired: gate.required
    });
    const status: GateStatus = result.metric.timedOut ? "timed_out" : result.exitCode === 0 ? "passed" : "failed";
    results.push({
      name: gate.name,
      required: gate.required,
      status,
      exitCode: result.exitCode,
      output: result.visibleOutput,
      runId: result.id,
      checkId
    });
  }
  return {
    ok: results.every((result) => !result.required || result.status === "passed"),
    configured: true,
    checkId,
    results
  };
}
