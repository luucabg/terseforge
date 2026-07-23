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
      timeoutMs: 50,
      terminationGraceMs: 100
    });
    expect(timeout.metric.timedOut).toBe(true);
    expect(timeout.exitCode).not.toBe(0);
  });

  it("bounds timeout escalation for a process tree that keeps output pipes open", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-tree-timeout-"));
    const script = [
      "const { spawn } = require('node:child_process')",
      "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'inherit', 'inherit'] })",
      "process.on('SIGTERM', () => {})",
      "setInterval(() => {}, 1000)"
    ].join(";");
    const started = Date.now();

    const result = await runProcess({
      root,
      command: process.execPath,
      args: ["-e", script],
      preset: "safe",
      kind: "exec",
      timeoutMs: 50,
      terminationGraceMs: 100
    });

    expect(result.metric.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("stores stdout and stderr separately alongside the merged best-effort view", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-streams-"));
    const result = await runProcess({
      root,
      command: process.execPath,
      args: ["-e", "process.stdout.write('out'); process.stderr.write('err')"],
      preset: "safe",
      kind: "exec"
    });

    await expect(readArtifact(root, result.id, "stdout")).resolves.toBe("out");
    await expect(readArtifact(root, result.id, "stderr")).resolves.toBe("err");
    const events = (await readArtifact(root, result.id, "events"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { sequence: number; stream: string; offset: number; length: number });
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: "stdout", offset: 0, length: 3 }),
        expect.objectContaining({ stream: "stderr", offset: 0, length: 3 })
      ])
    );
    expect(result.metric).toMatchObject({ stdoutBytes: 3, stderrBytes: 3 });
  });

  it("does not merge partial stdout and stderr lines in the compacted view", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-runner-partial-streams-"));
    const script = [
      "process.stdout.write('partial stdout')",
      "process.stderr.write('error: separate stderr\\n')",
      "setTimeout(() => process.stdout.write(' completed\\n'), 20)"
    ].join(";");

    const result = await runProcess({ root, command: process.execPath, args: ["-e", script], preset: "safe", kind: "exec" });

    expect(result.visibleOutput.split("\n")).toContain("error: separate stderr");
    expect(result.visibleOutput).not.toContain("stdouterror:");
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
