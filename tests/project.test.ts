import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../src/cli-program.js";
import { diagnoseProject, initializeProject, readIntegrationAsset } from "../src/project.js";
import { selectArtifactLines } from "../src/output.js";

describe("project setup and CLI surface", () => {
  it("exposes every documented MVP command", () => {
    const names = createCli().commands.map((command) => command.name());

    expect(names).toEqual(["init", "doctor", "exec", "output", "map", "context", "check", "handoff", "stats", "bench"]);
  });

  it("initializes safe local state and installs selected instructions", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-"));
    const result = await initializeProject(root, { preset: "safe", install: ["codex", "gemini"] });

    expect(result.created).toContain("terseforge.config.json");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("TerseForge");
    expect(await readFile(join(root, "GEMINI.md"), "utf8")).toContain("Quality gates");
    expect(await readFile(join(root, "terseforge.config.json"), "utf8")).toContain('"preset": "safe"');
  });

  it("never overwrites an existing instruction file", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-existing-"));
    await writeFile(join(root, "AGENTS.md"), "user-owned\n", "utf8");

    const result = await initializeProject(root, { preset: "lean", install: ["codex"] });

    expect(result.skipped).toContain("AGENTS.md");
    await expect(readFile(join(root, "AGENTS.md"), "utf8")).resolves.toBe("user-owned\n");
  });

  it("supports forced config replacement while preserving instruction files", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-force-"));
    await initializeProject(root, { preset: "lean", install: ["cursor", "windsurf", "cline"] });
    const second = await initializeProject(root, { preset: "ultra", install: ["cursor"], force: true });

    expect(second.created).toContain("terseforge.config.json");
    expect(second.skipped).toContain(".cursor/rules/terseforge.mdc");
    expect(await readFile(join(root, "terseforge.config.json"), "utf8")).toContain('"preset": "ultra"');
  });

  it("rejects unknown presets, integrations, and unsafe asset paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-invalid-"));

    await expect(initializeProject(root, { preset: "auto" as "safe" })).rejects.toThrow(/preset/iu);
    await expect(initializeProject(root, { install: ["unknown"] })).rejects.toThrow(/integration/iu);
    await expect(initializeProject(root, { install: ["toString"] })).rejects.toThrow(/integration/iu);
    await expect(readIntegrationAsset("../secret")).rejects.toThrow(/asset/iu);
    await expect(readIntegrationAsset("..")).rejects.toThrow(/asset/iu);
    await expect(readIntegrationAsset("SKILL.md")).resolves.toContain("name: terseforge");
  });

  it("reports required and optional doctor checks honestly", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-doctor-"));
    await initializeProject(root, { preset: "safe", install: [] });

    const report = await diagnoseProject(root);

    expect(report.ok).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Node.js >=22", ok: true })]));
    expect(report.integrations.every((integration) => ["native-limited", "instructions-only", "experimental"].includes(integration.level))).toBe(true);
  });

  it("fails doctor when required configuration is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-doctor-missing-"));
    const report = await diagnoseProject(root);

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ name: "Configuration", ok: false, required: true }));
    expect(report.integrations.every((integration) => !integration.installed)).toBe(true);
  });

  it("selects a validated 1-based inclusive output range", () => {
    expect(selectArtifactLines("one\ntwo\n")).toBe("one\ntwo\n");
    expect(selectArtifactLines("one\ntwo\nthree\nfour\n", "2:3")).toBe("two\nthree");
    expect(() => selectArtifactLines("one\n", "nope")).toThrow(/range/i);
    expect(() => selectArtifactLines("one\n", "0:2")).toThrow(/range/i);
    expect(() => selectArtifactLines("one\n", "3:2")).toThrow(/range/i);
  });
});
