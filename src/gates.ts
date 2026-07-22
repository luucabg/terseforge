import type { TerseForgeConfig } from "./config.js";
import { runProcess } from "./runner.js";

export interface GateResult {
  name: string;
  required: boolean;
  exitCode: number;
  output: string;
  runId: string;
}

export interface QualityGateResult {
  ok: boolean;
  results: GateResult[];
}

export async function runQualityGates(root: string, config: TerseForgeConfig): Promise<QualityGateResult> {
  const results: GateResult[] = [];
  for (const gate of config.qualityGates) {
    const result = await runProcess({
      root,
      command: gate.command,
      args: gate.args,
      preset: config.preset,
      kind: "gate",
      timeoutMs: gate.timeoutMs
    });
    results.push({ name: gate.name, required: gate.required, exitCode: result.exitCode, output: result.visibleOutput, runId: result.id });
  }
  return { ok: results.every((result) => !result.required || result.exitCode === 0), results };
}
