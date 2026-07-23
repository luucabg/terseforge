import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCli } from "../src/cli-program.js";
import { createDefaultConfig, loadConfig, setPreset, writeConfig } from "../src/config.js";
import { diagnoseProject, initializeProject, readIntegrationAsset } from "../src/project.js";
import { installSkill } from "../src/skill.js";
import { selectArtifactBytes, selectArtifactLines } from "../src/output.js";

describe("project setup and CLI surface", () => {
  it("exposes every documented MVP command", () => {
    const names = createCli().commands.map((command) => command.name());

    expect(names).toEqual(["init", "mode", "skill", "doctor", "exec", "output", "map", "context", "check", "handoff", "stats", "bench"]);
  });

  it("changes only the configured preset", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-mode-"));
    await writeConfig(root, { ...createDefaultConfig(), context: { budgetTokens: 987, maxFileBytes: 200_000 } });

    const changed = await setPreset(root, "lean");

    expect(changed.preset).toBe("lean");
    expect(changed.context.budgetTokens).toBe(987);
    await expect(loadConfig(root)).resolves.toEqual(changed);
  });

  it("initializes safe local state and installs selected instructions", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-"));
    const result = await initializeProject(root, { preset: "safe", install: ["codex", "gemini"] });

    expect(result.created).toContain("terseforge.config.json");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("TerseForge");
    expect(await readFile(join(root, "GEMINI.md"), "utf8")).toContain("Quality gates");
    expect(await readFile(join(root, "terseforge.config.json"), "utf8")).toContain('"preset": "safe"');
  });

  it("detects existing package scripts instead of creating no-op quality gates", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-gates-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ scripts: { typecheck: "tsc --noEmit", test: "vitest run", unrelated: "node tools.js" } }),
      "utf8"
    );

    await initializeProject(root);
    const config = await loadConfig(root);

    expect(config.qualityGates.map((gate) => gate.name)).toEqual(["typecheck", "test"]);
    expect(config.qualityGates.every((gate) => !gate.args.includes("--if-present"))).toBe(true);
  });

  it("leaves gates explicitly unconfigured when no supported project scripts exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-no-gates-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: {} }), "utf8");

    await initializeProject(root);

    await expect(loadConfig(root)).resolves.toMatchObject({ qualityGates: [] });
  });

  it("honors declared and lockfile package managers when detecting gates", async () => {
    const fixtures = [
      { manager: "pnpm", packageManager: "pnpm@10.0.0", lockfile: undefined },
      { manager: "yarn", packageManager: undefined, lockfile: "yarn.lock" },
      { manager: "bun", packageManager: undefined, lockfile: "bun.lock" }
    ];
    for (const fixture of fixtures) {
      const root = await mkdtemp(join(tmpdir(), `terseforge-init-${fixture.manager}-`));
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ ...(fixture.packageManager ? { packageManager: fixture.packageManager } : {}), scripts: { test: "node test.js" } }),
        "utf8"
      );
      if (fixture.lockfile) await writeFile(join(root, fixture.lockfile), "", "utf8");

      await initializeProject(root);

      expect((await loadConfig(root)).qualityGates[0]?.command).toBe(fixture.manager);
    }
  });

  it("treats malformed package metadata as an explicit no-gate configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-init-malformed-package-"));
    await writeFile(join(root, "package.json"), "{invalid", "utf8");

    await initializeProject(root);

    await expect(loadConfig(root)).resolves.toMatchObject({ qualityGates: [] });
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

  it("reports required and optional doctor checks without overstating integrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-doctor-"));
    await initializeProject(root, { preset: "safe", install: [] });

    const report = await diagnoseProject(root);

    expect(report.ok).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Node.js >=22", ok: true })]));
    expect(report.integrations.every((integration) => ["native-limited", "instructions-only", "experimental"].includes(integration.level))).toBe(true);
  });

  it("does not treat unrelated agent instruction files as TerseForge installations", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-doctor-foreign-"));
    await writeConfig(root, createDefaultConfig());
    await writeFile(join(root, "AGENTS.md"), "# Repository instructions\n\nRun the existing tests.\n", "utf8");
    await writeFile(join(root, "CLAUDE.md"), "# Claude instructions\n", "utf8");
    await writeFile(join(root, "GEMINI.md"), "# Gemini instructions\n", "utf8");

    const report = await diagnoseProject(root);

    expect(report.integrations.filter((integration) => integration.name !== "Cursor / Windsurf / Cline").every((integration) => !integration.installed)).toBe(true);
  });

  it("recognizes native project skills for Codex, Claude Code, and Gemini CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-doctor-skills-"));
    await initializeProject(root, { preset: "safe" });
    await Promise.all([
      installSkill(root, { agent: "codex", scope: "project" }),
      installSkill(root, { agent: "claude", scope: "project" }),
      installSkill(root, { agent: "gemini", scope: "project" })
    ]);

    const report = await diagnoseProject(root);

    expect(report.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Codex", installed: true, level: "native-limited" }),
        expect.objectContaining({ name: "Claude Code", installed: true, level: "native-limited" }),
        expect.objectContaining({ name: "Gemini CLI", installed: true, level: "native-limited" })
      ])
    );
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
    expect(selectArtifactLines("one\r\ntwo\r\nthree", "2:3")).toBe("two\r\nthree");
    expect(selectArtifactLines("one\ntwo\nthree\nfour\n", "2:3")).toBe("two\nthree\n");
    expect(() => selectArtifactLines("one\n", "nope")).toThrow(/range/i);
    expect(() => selectArtifactLines("one\n", "0:2")).toThrow(/range/i);
    expect(() => selectArtifactLines("one\n", "3:2")).toThrow(/range/i);
    expect(selectArtifactLines("one\n", "3:4")).toBe("");
  });

  it("selects ranges without decoding or replacing non-UTF-8 bytes", () => {
    const raw = Buffer.from([0xff, 0x0a, 0x61, 0x0d, 0x0a, 0x80]);

    expect(selectArtifactBytes(raw)).toEqual(raw);
    expect(selectArtifactBytes(raw, "2:3")).toEqual(Buffer.from([0x61, 0x0d, 0x0a, 0x80]));
    expect(selectArtifactBytes(raw, "4:5")).toEqual(Buffer.alloc(0));
  });
});
