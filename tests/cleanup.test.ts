import { access, appendFile, mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanLocalState } from "../src/cleanup.js";
import { appendMetric, createArtifactWriter, ensureStateDirectories, statePath, type RunMetric } from "../src/storage.js";

function metric(id: string, startedAt: string): RunMetric {
  return {
    schemaVersion: 1,
    id,
    kind: "exec",
    preset: "safe",
    command: "node",
    exitCode: 0,
    startedAt,
    durationMs: 1,
    rawBytes: 1,
    rawLines: 1,
    visibleBytes: 1,
    visibleLines: 1,
    omittedLines: 0,
    estimatedInputTokens: 1,
    estimatedVisibleTokens: 1
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("local state retention", () => {
  it("previews and then removes only expired artifacts, reports, and valid metrics", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-clean-"));
    await ensureStateDirectories(root);
    const oldWriter = await createArtifactWriter(root, "old_run");
    await oldWriter.write("old output");
    await oldWriter.close();
    const recentWriter = await createArtifactWriter(root, "recent_run");
    await recentWriter.write("recent output");
    await recentWriter.close();
    const oldReport = join(statePath(root), "benchmarks", "old.json");
    await writeFile(oldReport, "{}\n", { encoding: "utf8", mode: 0o600 });
    const oldTime = new Date("2025-01-01T00:00:00.000Z");
    await Promise.all([utimes(oldWriter.path, oldTime, oldTime), utimes(oldReport, oldTime, oldTime)]);
    await appendMetric(root, metric("old_metric", "2025-01-01T00:00:00.000Z"));
    await appendMetric(root, metric("recent_metric", "2026-07-20T00:00:00.000Z"));
    await appendFile(join(statePath(root), "runs.jsonl"), "{damaged historical line\n", "utf8");

    const preview = await cleanLocalState(root, {
      olderThanDays: 30,
      dryRun: true,
      now: new Date("2026-07-27T00:00:00.000Z")
    });

    expect(preview).toMatchObject({ dryRun: true, files: 2, metricRecords: 1 });
    expect(preview.paths).toEqual(
      expect.arrayContaining([".terseforge/artifacts/old_run.log", ".terseforge/benchmarks/old.json"])
    );
    expect(await exists(oldWriter.path)).toBe(true);
    expect(await readFile(join(statePath(root), "runs.jsonl"), "utf8")).toContain("old_metric");

    const applied = await cleanLocalState(root, {
      olderThanDays: 30,
      now: new Date("2026-07-27T00:00:00.000Z")
    });
    const metrics = await readFile(join(statePath(root), "runs.jsonl"), "utf8");

    expect(applied).toMatchObject({ dryRun: false, files: 2, metricRecords: 1 });
    expect(await exists(oldWriter.path)).toBe(false);
    expect(await exists(oldReport)).toBe(false);
    expect(await exists(recentWriter.path)).toBe(true);
    expect(metrics).not.toContain("old_metric");
    expect(metrics).toContain("recent_metric");
    expect(metrics).toContain("{damaged historical line");
  });

  it("rejects unsafe retention windows before touching state", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-clean-invalid-"));

    await expect(cleanLocalState(root, { olderThanDays: 0 })).rejects.toThrow(/older-than/iu);
    await expect(cleanLocalState(root, { olderThanDays: 1.5 })).rejects.toThrow(/older-than/iu);
  });

  it("refuses a state-directory link instead of deleting files outside the project", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-clean-linked-root-"));
    const outside = await mkdtemp(join(tmpdir(), "terseforge-clean-linked-target-"));
    const outsideArtifacts = join(outside, "artifacts");
    await mkdir(outsideArtifacts, { recursive: true });
    const externalFile = join(outsideArtifacts, "external.log");
    await writeFile(externalFile, "must remain\n", "utf8");
    const oldTime = new Date("2025-01-01T00:00:00.000Z");
    await utimes(externalFile, oldTime, oldTime);
    await symlink(outside, statePath(root), process.platform === "win32" ? "junction" : "dir");

    await expect(
      cleanLocalState(root, { olderThanDays: 30, now: new Date("2026-07-27T00:00:00.000Z") })
    ).rejects.toThrow(/symbolic link/iu);
    expect(await readFile(externalFile, "utf8")).toBe("must remain\n");
  });
});
