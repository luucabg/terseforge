import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Preset } from "./config.js";
import type { PruningAdapter } from "./pruning-adapters.js";
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

export interface BenchmarkFixtureDefinition {
  name: string;
  adapter: PruningAdapter;
  text: string;
  diagnostics: string[];
}

export interface BenchmarkFixtureResult {
  name: string;
  adapter: PruningAdapter;
  rawBytes: number;
  conditions: BenchmarkCondition[];
}

export interface BenchmarkResult {
  schemaVersion: 1;
  corpusVersion: 2;
  scope: "tool-output-pruning-only";
  generatedAt: string;
  fixture: "diagnostic-corpus-v2";
  fixtureCount: number;
  conditions: BenchmarkCondition[];
  fixtures: BenchmarkFixtureResult[];
  note: string;
}

export function createBenchmarkFixture(): string {
  return [
    "tool output",
    ...Array.from({ length: 250 }, (_, index) => `transform module-${index}.ts`),
    "src/payment.ts:42:9 warning: rounded monetary value",
    ...Array.from({ length: 150 }, (_, index) => `test case ${index} passed`),
    "src/auth.ts:17:3 error TS2322: invalid session type",
    ...Array.from({ length: 100 }, (_, index) => `cleanup worker ${index}`),
    "Tests: 1 failed, 149 passed"
  ].join("\n");
}

export function createBenchmarkFixtures(): BenchmarkFixtureDefinition[] {
  return [
    {
      name: "generic-tool-output",
      adapter: "generic",
      text: createBenchmarkFixture(),
      diagnostics: ["warning: rounded monetary value", "error TS2322", "1 failed"]
    },
    {
      name: "typescript-build",
      adapter: "typescript",
      text: [
        "tsc --build --pretty false",
        ...Array.from({ length: 130 }, (_, index) => `Project src/module-${index}.ts is up to date`),
        "src/payment.ts(42,9): error TS2322: Type 'number' is not assignable to type 'Money'.",
        "  The amount must be converted through Money.fromMinorUnits.",
        "src/session.ts(18,3): error TS2741: Property 'expiresAt' is missing in type 'SessionInput'.",
        "Found 2 errors.",
        ...Array.from({ length: 130 }, (_, index) => `Build bookkeeping ${index}`)
      ].join("\n"),
      diagnostics: ["error TS2322", "Money.fromMinorUnits", "error TS2741", "Found 2 errors"]
    },
    {
      name: "eslint",
      adapter: "eslint",
      text: [
        "eslint .",
        ...Array.from({ length: 130 }, (_, index) => `Linted src/module-${index}.ts`),
        "src/auth.ts",
        "  17:3  error    Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any",
        "  42:1  warning  Unused disable directive                  eslint-comments/no-unused-disable",
        "",
        "✖ 2 problems (1 error, 1 warning)",
        ...Array.from({ length: 130 }, (_, index) => `Formatter bookkeeping ${index}`)
      ].join("\n"),
      diagnostics: ["17:3  error", "42:1  warning", "2 problems (1 error, 1 warning)"]
    },
    {
      name: "vitest",
      adapter: "vitest",
      text: [
        "vitest 4.1.10",
        ...Array.from({ length: 130 }, (_, index) => `✓ tests/passing-${index}.test.ts`),
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
        "Test Files  1 failed | 130 passed",
        "Tests  1 failed | 130 passed",
        ...Array.from({ length: 130 }, (_, index) => `coverage file ${index}`)
      ].join("\n"),
      diagnostics: ["validates expired sessions", "-   status: 200", "+   status: 401", "tests/auth.test.ts:42:18"]
    },
    {
      name: "jest",
      adapter: "jest",
      text: [
        "jest --runInBand",
        ...Array.from({ length: 130 }, (_, index) => `PASS tests/passing-${index}.test.ts`),
        "FAIL tests/payment.test.ts",
        "  ● payment totals > rounds minor units",
        "",
        "    expect(received).toBe(expected)",
        "",
        "    Expected: 20",
        "    Received: 21",
        "",
        "      at Object.<anonymous> (tests/payment.test.ts:28:19)",
        "Test Suites: 1 failed, 130 passed, 131 total",
        "Tests:       1 failed, 130 passed, 131 total",
        ...Array.from({ length: 130 }, (_, index) => `cache cleanup ${index}`)
      ].join("\n"),
      diagnostics: ["payment totals", "Expected: 20", "Received: 21", "tests/payment.test.ts:28:19"]
    }
  ];
}

function reduction(rawBytes: number, visibleBytes: number): number {
  return rawBytes === 0 ? 0 : Number((((rawBytes - visibleBytes) / rawBytes) * 100).toFixed(2));
}

export async function runBenchmark(root: string): Promise<BenchmarkResult> {
  await ensureStateDirectories(root);
  const fixtures: BenchmarkFixtureResult[] = [];
  for (const fixture of createBenchmarkFixtures()) {
    const rawBytes = Buffer.byteLength(fixture.text);
    const conditions: BenchmarkCondition[] = [];
    for (const preset of ["safe", "lean", "ultra"] as const) {
      const id = createRunId(`bench_${fixture.adapter}_${preset}`);
      const writer = await createArtifactWriter(root, id);
      await writer.write(fixture.text);
      await writer.close();
      const pruned = pruneText(fixture.text, preset, { adapter: fixture.adapter });
      const raw = await readArtifact(root, id);
      conditions.push({
        preset,
        rawBytes,
        visibleBytes: pruned.visibleBytes,
        reductionPercent: reduction(rawBytes, pruned.visibleBytes),
        diagnosticsRetained: fixture.diagnostics.every((diagnostic) => pruned.text.includes(diagnostic)),
        rawRecoverable: raw === fixture.text
      });
    }
    fixtures.push({ name: fixture.name, adapter: fixture.adapter, rawBytes, conditions });
  }

  const conditions = (["safe", "lean", "ultra"] as const).map((preset): BenchmarkCondition => {
    const matches = fixtures.flatMap((fixture) => fixture.conditions.filter((condition) => condition.preset === preset));
    const rawBytes = matches.reduce((total, condition) => total + condition.rawBytes, 0);
    const visibleBytes = matches.reduce((total, condition) => total + condition.visibleBytes, 0);
    return {
      preset,
      rawBytes,
      visibleBytes,
      reductionPercent: reduction(rawBytes, visibleBytes),
      diagnosticsRetained: matches.every((condition) => condition.diagnosticsRetained),
      rawRecoverable: matches.every((condition) => condition.rawRecoverable)
    };
  });

  const result: BenchmarkResult = {
    schemaVersion: 1,
    corpusVersion: 2,
    scope: "tool-output-pruning-only",
    generatedAt: new Date().toISOString(),
    fixture: "diagnostic-corpus-v2",
    fixtureCount: fixtures.length,
    conditions,
    fixtures,
    note: "This deterministic multi-tool corpus measures visible tool-output pruning, not end-to-end agent tokens or code quality."
  };
  await writeFile(join(statePath(root), "benchmarks", `${createRunId("benchmark")}.json`), `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  return result;
}
