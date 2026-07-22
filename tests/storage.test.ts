import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendMetric, createArtifactWriter, readArtifact, readMetrics } from "../src/storage.js";

describe("local storage", () => {
  it("stores and retrieves complete raw output", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-storage-"));
    const writer = await createArtifactWriter(root, "run-safe_123");
    await writer.write("first\n");
    await writer.write("second\nthird\n");
    await writer.close();

    await expect(readArtifact(root, "run-safe_123")).resolves.toBe("first\nsecond\nthird\n");
    await expect(readArtifact(root, "../outside")).rejects.toThrow(/identifier/i);
  });

  it("appends parseable local-only metrics", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-metrics-"));
    const metric = {
      schemaVersion: 1 as const,
      id: "run_1",
      kind: "exec" as const,
      preset: "safe" as const,
      command: "node",
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      durationMs: 25,
      rawBytes: 100,
      rawLines: 10,
      visibleBytes: 40,
      visibleLines: 4,
      omittedLines: 6,
      estimatedInputTokens: 25,
      estimatedVisibleTokens: 10
    };

    await appendMetric(root, metric);

    await expect(readMetrics(root)).resolves.toEqual([metric]);
  });

  it("returns no metrics before the first run", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-no-metrics-"));

    await expect(readMetrics(root)).resolves.toEqual([]);
  });

  it("rejects duplicate artifact identifiers instead of overwriting raw logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-duplicate-artifact-"));
    const first = await createArtifactWriter(root, "same_id");
    await first.write("original");
    await first.close();

    await expect(createArtifactWriter(root, "same_id")).rejects.toThrow();
    await expect(readArtifact(root, "same_id")).resolves.toBe("original");
  });
});
