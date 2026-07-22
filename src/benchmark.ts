import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Preset } from "./config.js";
import { pruneText } from "./pruning.js";
import { createArtifactWriter, createRunId, ensureStateDirectories, readArtifact, statePath } from "./storage.js";

export interface BenchmarkCondition {
  preset: Preset;
  rawBytes: number;
  visibleBytes: number;
  reductionPercent: number;
  diagnosticsRetained: boolean;
  rawRecoverable: boolean;
}

export interface BenchmarkResult {
  schemaVersion: 1;
  scope: "tool-output-pruning-only";
  generatedAt: string;
  fixture: string;
  conditions: BenchmarkCondition[];
  note: string;
}

export function createBenchmarkFixture(): string {
  return [
    "vitest 4.1.10",
    ...Array.from({ length: 250 }, (_, index) => `transform module-${index}.ts`),
    "src/payment.ts:42:9 warning: rounded monetary value",
    ...Array.from({ length: 150 }, (_, index) => `test case ${index} passed`),
    "src/auth.ts:17:3 error TS2322: invalid session type",
    ...Array.from({ length: 100 }, (_, index) => `cleanup worker ${index}`),
    "Tests: 1 failed, 149 passed"
  ].join("\n");
}

export async function runBenchmark(root: string): Promise<BenchmarkResult> {
  await ensureStateDirectories(root);
  const fixture = createBenchmarkFixture();
  const diagnostics = ["warning: rounded monetary value", "error TS2322", "1 failed"];
  const conditions: BenchmarkCondition[] = [];
  for (const preset of ["safe", "lean", "ultra"] as const) {
    const id = createRunId(`bench_${preset}`);
    const writer = await createArtifactWriter(root, id);
    await writer.write(fixture);
    await writer.close();
    const pruned = pruneText(fixture, preset);
    const raw = await readArtifact(root, id);
    const rawBytes = Buffer.byteLength(fixture);
    conditions.push({
      preset,
      rawBytes,
      visibleBytes: pruned.visibleBytes,
      reductionPercent: Number((((rawBytes - pruned.visibleBytes) / rawBytes) * 100).toFixed(2)),
      diagnosticsRetained: diagnostics.every((diagnostic) => pruned.text.includes(diagnostic)),
      rawRecoverable: raw === fixture
    });
  }
  const result: BenchmarkResult = {
    schemaVersion: 1,
    scope: "tool-output-pruning-only",
    generatedAt: new Date().toISOString(),
    fixture: "synthetic-typescript-test-log-v1",
    conditions,
    note: "This deterministic benchmark measures visible tool-output pruning, not end-to-end agent tokens or code quality."
  };
  await writeFile(join(statePath(root), "benchmarks", `${createRunId("benchmark")}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
