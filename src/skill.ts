import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_AGENTS = ["codex", "claude", "gemini"] as const;
export const SKILL_SCOPES = ["user", "project"] as const;

export type SkillAgent = (typeof SKILL_AGENTS)[number];
export type SkillScope = (typeof SKILL_SCOPES)[number];

const SKILL_SOURCE = fileURLToPath(new URL("../skills/terseforge/", import.meta.url));
const SKILL_FILES = ["SKILL.md", join("agents", "openai.yaml")] as const;

export interface SkillLocationOptions {
  agent: SkillAgent;
  scope: SkillScope;
  userRoot?: string;
  codexRoot?: string;
}

export interface SkillInstallOptions extends SkillLocationOptions {
  force?: boolean;
}

export interface SkillInspection {
  agent: SkillAgent;
  scope: SkillScope;
  destination: string;
  status: "missing" | "current" | "outdated" | "foreign";
}

export interface SkillInstallResult {
  agent: SkillAgent;
  scope: SkillScope;
  destination: string;
  status: "installed" | "updated" | "current" | "preserved";
  reloadHint: string;
}

export function resolveSkillDestination(root: string, options: SkillLocationOptions): string {
  if (!(SKILL_AGENTS as readonly string[]).includes(options.agent)) throw new Error(`Unknown skill agent: ${options.agent}`);
  if (!(SKILL_SCOPES as readonly string[]).includes(options.scope)) throw new Error(`Unknown skill scope: ${options.scope}`);

  if (options.scope === "project") {
    const directory = options.agent === "codex" ? ".agents" : options.agent === "claude" ? ".claude" : ".gemini";
    return resolve(root, directory, "skills", "terseforge");
  }

  const userRoot = resolve(options.userRoot ?? homedir());
  if (options.agent === "codex") {
    const codexRoot = options.codexRoot?.trim() ? resolve(options.codexRoot) : join(userRoot, ".codex");
    return join(codexRoot, "skills", "terseforge");
  }
  return join(userRoot, options.agent === "claude" ? ".claude" : ".gemini", "skills", "terseforge");
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function directoryHasEntries(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function inspectSkill(root: string, options: SkillLocationOptions): Promise<SkillInspection> {
  const destination = resolveSkillDestination(root, options);
  const installedSkill = await readOptional(join(destination, "SKILL.md"));
  if (installedSkill === undefined) {
    const status = (await directoryHasEntries(destination)) ? "foreign" : "missing";
    return { ...options, destination, status };
  }
  if (!/^name:\s*terseforge\s*$/mu.test(installedSkill)) return { ...options, destination, status: "foreign" };

  for (const relativePath of SKILL_FILES) {
    const [expected, installed] = await Promise.all([
      readFile(join(SKILL_SOURCE, relativePath), "utf8"),
      readOptional(join(destination, relativePath))
    ]);
    if (installed !== expected) return { ...options, destination, status: "outdated" };
  }
  return { ...options, destination, status: "current" };
}

async function copySkillFiles(destination: string, exclusive: boolean): Promise<void> {
  for (const relativePath of SKILL_FILES) {
    const target = join(destination, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(SKILL_SOURCE, relativePath), target, exclusive ? constants.COPYFILE_EXCL : 0);
  }
}

function reloadHint(agent: SkillAgent, scope: SkillScope): string {
  if (agent === "gemini") return "Run /skills reload in Gemini CLI if the skill is not listed yet.";
  if (agent === "claude") return scope === "project" ? "Claude Code detects project skill changes automatically." : "Start a new Claude Code session if the skill is not listed yet.";
  return "Start a new Codex session if the skill is not listed yet.";
}

export async function installSkill(
  root: string,
  options: SkillInstallOptions
): Promise<SkillInstallResult> {
  const inspection = await inspectSkill(root, options);
  const base = { agent: options.agent, scope: options.scope, destination: inspection.destination, reloadHint: reloadHint(options.agent, options.scope) };
  if (inspection.status === "current") return { ...base, status: "current" };
  if (inspection.status === "foreign") return { ...base, status: "preserved" };
  if (inspection.status === "outdated" && !options.force) return { ...base, status: "preserved" };

  if (inspection.status === "missing") {
    try {
      await copySkillFiles(inspection.destination, true);
      return { ...base, status: "installed" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = await inspectSkill(root, options);
      return { ...base, status: raced.status === "current" ? "current" : "preserved" };
    }
  }

  await copySkillFiles(inspection.destination, false);
  return { ...base, status: "updated" };
}
