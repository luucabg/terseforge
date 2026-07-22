import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installSkill, inspectSkill, resolveSkillDestination } from "../src/skill.js";

describe("Agent Skill installation", () => {
  it("resolves native user and project locations on every supported agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-root-"));
    const userRoot = await mkdtemp(join(tmpdir(), "terseforge-skill-user-"));

    expect(resolveSkillDestination(root, { agent: "codex", scope: "user", userRoot })).toBe(
      join(userRoot, ".codex", "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "claude", scope: "user", userRoot })).toBe(
      join(userRoot, ".claude", "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "gemini", scope: "user", userRoot })).toBe(
      join(userRoot, ".gemini", "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "codex", scope: "project", userRoot })).toBe(
      join(root, ".agents", "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "claude", scope: "project", userRoot })).toBe(
      join(root, ".claude", "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "gemini", scope: "project", userRoot })).toBe(
      join(root, ".gemini", "skills", "terseforge")
    );
  });

  it("honors an explicit Codex home without reusing it for other agents", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-root-"));
    const userRoot = await mkdtemp(join(tmpdir(), "terseforge-skill-user-"));
    const codexRoot = join(userRoot, "custom-codex");

    expect(resolveSkillDestination(root, { agent: "codex", scope: "user", userRoot, codexRoot })).toBe(
      join(codexRoot, "skills", "terseforge")
    );
    expect(resolveSkillDestination(root, { agent: "claude", scope: "user", userRoot, codexRoot })).toBe(
      join(userRoot, ".claude", "skills", "terseforge")
    );
  });

  it("installs the portable skill idempotently without overwriting a foreign skill", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-project-"));
    const first = await installSkill(root, { agent: "codex", scope: "project" });
    const second = await installSkill(root, { agent: "codex", scope: "project" });

    expect(first.status).toBe("installed");
    expect(second.status).toBe("current");
    await expect(readFile(join(first.destination, "SKILL.md"), "utf8")).resolves.toContain("activate TerseForge in this project");
    await expect(readFile(join(first.destination, "agents", "openai.yaml"), "utf8")).resolves.toContain("$terseforge");

    const claudeDestination = resolveSkillDestination(root, { agent: "claude", scope: "project" });
    await mkdir(claudeDestination, { recursive: true });
    await writeFile(join(claudeDestination, "SKILL.md"), "---\nname: another-skill\n---\n", "utf8");

    const preserved = await installSkill(root, { agent: "claude", scope: "project" });
    expect(preserved.status).toBe("preserved");
    await expect(readFile(join(claudeDestination, "SKILL.md"), "utf8")).resolves.toContain("another-skill");
  });

  it("reports whether a native skill installation is current", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-status-"));
    const before = await inspectSkill(root, { agent: "gemini", scope: "project" });
    await installSkill(root, { agent: "gemini", scope: "project" });
    const after = await inspectSkill(root, { agent: "gemini", scope: "project" });

    expect(before.status).toBe("missing");
    expect(after.status).toBe("current");
  });

  it("preserves a partially occupied destination instead of mixing skill files", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-partial-"));
    const destination = resolveSkillDestination(root, { agent: "codex", scope: "project" });
    const foreignMetadata = join(destination, "agents", "openai.yaml");
    await mkdir(join(destination, "agents"), { recursive: true });
    await writeFile(foreignMetadata, "interface:\n  display_name: Foreign\n", "utf8");

    const result = await installSkill(root, { agent: "codex", scope: "project" });

    expect(result.status).toBe("preserved");
    await expect(readFile(foreignMetadata, "utf8")).resolves.toContain("Foreign");
    await expect(readFile(join(destination, "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("updates only an existing TerseForge skill when force is explicit", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-skill-update-"));
    const installed = await installSkill(root, { agent: "claude", scope: "project" });
    await writeFile(join(installed.destination, "SKILL.md"), "---\nname: terseforge\ndescription: old\n---\n", "utf8");

    const preserved = await installSkill(root, { agent: "claude", scope: "project" });
    const updated = await installSkill(root, { agent: "claude", scope: "project", force: true });

    expect(preserved.status).toBe("preserved");
    expect(updated.status).toBe("updated");
    await expect(inspectSkill(root, { agent: "claude", scope: "project" })).resolves.toMatchObject({ status: "current" });
  });
});
