import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runProcess } from "../src/runner.js";
import { readArtifact, readMetrics } from "../src/storage.js";

describe("process runner", () => {
  it("executes without a shell, preserves raw output, and records metrics", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-"));
    const script = [
      "console.log('begin')",
      "for (let i = 0; i < 100; i++) console.log('noise ' + i)",
      "console.error('warning: keep this diagnostic')",
      "console.log('done')"
    ].join(";");

    const result = await runProcess({ root, command: process.execPath, args: ["-e", script], preset: "ultra", kind: "exec" });
    const raw = await readArtifact(root, result.id);
    const metrics = await readMetrics(root);

    expect(result.exitCode).toBe(0);
    expect(result.visibleOutput).toContain("warning: keep this diagnostic");
    expect(result.visibleOutput).toContain(`terseforge output ${result.id}`);
    expect(raw).toContain("noise 50");
    expect(metrics[0]).toMatchObject({ id: result.id, command: process.execPath, exitCode: 0 });
  });

  it("returns a non-zero exit code without swallowing the error", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-fail-"));
    const result = await runProcess({
      root,
      command: process.execPath,
      args: ["-e", "console.error('fatal: broken'); process.exit(7)"],
      preset: "safe",
      kind: "gate"
    });

    expect(result.exitCode).toBe(7);
    expect(result.visibleOutput).toContain("fatal: broken");
  });

  it("turns missing executables and timeouts into visible failures", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "terseforge-runner-missing-"));
    const missing = await runProcess({ root: missingRoot, command: "terseforge-definitely-missing", args: [], preset: "safe", kind: "exec" });
    expect(missing.exitCode).not.toBe(0);
    expect(missing.visibleOutput).toContain("failed to start");

    const timeoutRoot = await mkdtemp(join(tmpdir(), "terseforge-runner-timeout-"));
    const timeout = await runProcess({
      root: timeoutRoot,
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      preset: "safe",
      kind: "exec",
      timeoutMs: 50
    });
    expect(timeout.metric.timedOut).toBe(true);
    expect(timeout.exitCode).not.toBe(0);
  });

  it("does not corrupt UTF-8 diagnostics split across process chunks", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-unicode-"));
    const script = [
      "process.stdout.write(Buffer.from([0x77,0x61,0x72,0x6e,0x69,0x6e,0x67,0x3a,0x20,0xf0,0x9f]))",
      "setTimeout(() => process.stdout.write(Buffer.from([0x9a,0xa8,0x20,0x63,0x61,0x66,0xc3,0xa9,0x5c,0x6e])), 20)"
    ].join(";");
    const result = await runProcess({ root, command: process.execPath, args: ["-e", script], preset: "safe", kind: "exec" });

    expect(result.visibleOutput).toContain("warning: 🚨 café");
    await expect(readArtifact(root, result.id)).resolves.toContain("warning: 🚨 café");
  });

  it("streams multi-megabyte output to disk without losing bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-large-"));
    const byteCount = 2_000_000;
    const result = await runProcess({
      root,
      command: process.execPath,
      args: ["-e", `process.stdout.write('x'.repeat(${byteCount}))`],
      preset: "ultra",
      kind: "exec"
    });
    const raw = await readArtifact(root, result.id);

    expect(result.metric.rawBytes).toBe(byteCount);
    expect(Buffer.byteLength(raw)).toBe(byteCount);
  });
});
