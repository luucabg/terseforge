import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendMetric, artifactPath, createArtifactWriter, readArtifact, readArtifactBytes, readMetrics, statePath, type ArtifactChannel } from "../src/storage.js";

describe("local storage", () => {
  it("stores and retrieves complete raw output", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-storage-"));
    const writer = await createArtifactWriter(root, "run-safe_123");
    await writer.write("first\n");
    await writer.write("second\nthird\n");
    await writer.close();

    await expect(readArtifact(root, "run-safe_123")).resolves.toBe("first\nsecond\nthird\n");
    await expect(readArtifactBytes(root, "run-safe_123")).resolves.toEqual(Buffer.from("first\nsecond\nthird\n"));
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

  it("keeps valid legacy metrics readable when a historical line is damaged", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-metrics-damaged-"));
    const metric = {
      schemaVersion: 1,
      id: "legacy",
      kind: "gate",
      preset: "safe",
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
    await appendMetric(root, metric as Parameters<typeof appendMetric>[1]);
    await appendFile(join(statePath(root), "runs.jsonl"), "{damaged\n", "utf8");

    await expect(readMetrics(root)).resolves.toEqual([metric]);
  });

  it("rejects duplicate artifact identifiers instead of overwriting raw logs", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-duplicate-artifact-"));
    const first = await createArtifactWriter(root, "same_id");
    await first.write("original");
    await first.close();

    await expect(createArtifactWriter(root, "same_id")).rejects.toThrow();
    await expect(readArtifact(root, "same_id")).resolves.toBe("original");
  });

  it("rejects unsupported artifact channels at the runtime boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-invalid-channel-"));

    expect(() => artifactPath(root, "run_1", "../escape" as ArtifactChannel)).toThrow(/channel/i);
  });
});
