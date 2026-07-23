import { execFile } from "node:child_process";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDefaultConfig, loadConfig, PRESETS, writeConfig, type Preset, type TerseForgeConfig } from "./config.js";
import { ensureStateDirectories, statePath } from "./storage.js";

const execFileAsync = promisify(execFile);
const ASSET_ROOT = fileURLToPath(new URL("../assets/integrations/", import.meta.url));
const INTEGRATION_ASSETS = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", "cursor.mdc", "windsurf.md", "cline.md", "SKILL.md"] as const;

export const INSTALL_TARGETS = {
  codex: { asset: "AGENTS.md", target: "AGENTS.md" },
  claude: { asset: "CLAUDE.md", target: "CLAUDE.md" },
  gemini: { asset: "GEMINI.md", target: "GEMINI.md" },
  cursor: { asset: "cursor.mdc", target: ".cursor/rules/terseforge.mdc" },
  windsurf: { asset: "windsurf.md", target: ".windsurf/rules/terseforge.md" },
  cline: { asset: "cline.md", target: ".clinerules/terseforge.md" }
} as const;

export type InstallTarget = keyof typeof INSTALL_TARGETS;

export interface InitializeResult {
  created: string[];
  skipped: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyIfAbsent(root: string, asset: string, target: string, result: InitializeResult): Promise<void> {
  const destination = resolve(root, target);
  if (await exists(destination)) {
    result.skipped.push(target);
    return;
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(ASSET_ROOT, asset), destination);
  result.created.push(target);
}

async function detectedPackageManager(root: string, packageManager: unknown): Promise<string> {
  if (typeof packageManager === "string") {
    const declared = /^(npm|pnpm|yarn|bun)@/u.exec(packageManager)?.[1];
    if (declared) return declared;
  }
  if (await exists(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(join(root, "yarn.lock"))) return "yarn";
  if ((await exists(join(root, "bun.lock"))) || (await exists(join(root, "bun.lockb")))) return "bun";
  return "npm";
}

export async function detectProjectQualityGates(root: string): Promise<TerseForgeConfig["qualityGates"]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as unknown;
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const record = parsed as { scripts?: unknown; packageManager?: unknown };
  if (typeof record.scripts !== "object" || record.scripts === null) return [];
  const scripts = record.scripts as Record<string, unknown>;
  const command = await detectedPackageManager(root, record.packageManager);
  const candidates = [
    { name: "typecheck", timeoutMs: 120_000 },
    { name: "lint", timeoutMs: 120_000 },
    { name: "test", timeoutMs: 300_000 },
    { name: "build", timeoutMs: 180_000 }
  ];
  return candidates
    .filter(({ name }) => typeof scripts[name] === "string" && scripts[name].trim().length > 0)
    .map(({ name, timeoutMs }) => ({ name, command, args: ["run", name], required: true, timeoutMs }));
}

export async function initializeProject(
  root: string,
  options: { preset?: Preset; install?: string[]; force?: boolean } = {}
): Promise<InitializeResult> {
  const preset = options.preset ?? "safe";
  if (!PRESETS.includes(preset)) throw new Error(`Unknown preset: ${preset}`);
  const install = options.install ?? [];
  for (const name of install) {
    if (!Object.hasOwn(INSTALL_TARGETS, name)) throw new Error(`Unknown integration: ${name}`);
  }

  const result: InitializeResult = { created: [], skipped: [] };
  await ensureStateDirectories(root);
  const configPath = join(root, "terseforge.config.json");
  if ((await exists(configPath)) && !options.force) {
    result.skipped.push("terseforge.config.json");
  } else {
    await writeConfig(root, { ...createDefaultConfig(), preset, qualityGates: await detectProjectQualityGates(root) });
    result.created.push("terseforge.config.json");
  }

  for (const asset of INTEGRATION_ASSETS) {
    await copyIfAbsent(root, asset, relative(root, join(statePath(root), "integrations", asset)), result);
  }
  for (const name of install) {
    const integration = INSTALL_TARGETS[name as InstallTarget];
    await copyIfAbsent(root, integration.asset, integration.target, result);
  }
  return result;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

export interface IntegrationStatus {
  name: string;
  level: "native-limited" | "instructions-only" | "experimental";
  installed: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  integrations: IntegrationStatus[];
}

async function commandVersion(command: string): Promise<string | undefined> {
  try {
    const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
    const { stdout, stderr } = await execFileAsync(executable, ["--version"], { encoding: "utf8", timeout: 3_000, windowsHide: true });
    return (stdout || stderr).trim().split(/\r?\n/u)[0];
  } catch {
    return undefined;
  }
}

async function containsManagedInstructions(path: string): Promise<boolean> {
  try {
    const content = await readFile(path, "utf8");
    return /<!--\s*terseforge:managed-instructions\s*-->/iu.test(content) || /^#{1,3}\s+TerseForge\b/mu.test(content);
  } catch {
    return false;
  }
}

async function containsTerseForgeSkill(path: string): Promise<boolean> {
  try {
    return /^name:\s*terseforge\s*$/mu.test(await readFile(path, "utf8"));
  } catch {
    return false;
  }
}

export async function diagnoseProject(root: string): Promise<DoctorReport> {
  const major = Number(process.versions.node.split(".")[0]);
  const checks: DoctorCheck[] = [
    { name: "Node.js >=22", ok: major >= 22, required: true, detail: process.version }
  ];
  const gitVersion = await commandVersion("git");
  checks.push({ name: "Git", ok: gitVersion !== undefined, required: false, detail: gitVersion ?? "not found; untracked fallback will be used" });
  try {
    const config = await loadConfig(root);
    checks.push({ name: "Configuration", ok: true, required: true, detail: `schema v${config.schemaVersion}, preset ${config.preset}, telemetry disabled` });
  } catch (error) {
    checks.push({ name: "Configuration", ok: false, required: true, detail: (error as Error).message });
  }

  const integrations: IntegrationStatus[] = [
    {
      name: "Claude Code",
      level: "native-limited",
      installed:
        (await containsManagedInstructions(join(root, "CLAUDE.md"))) ||
        (await containsTerseForgeSkill(join(root, ".claude", "skills", "terseforge", "SKILL.md"))),
      detail: "native project skill or instruction asset plus explicit CLI; automatic interception is not claimed"
    },
    {
      name: "Codex",
      level: "native-limited",
      installed:
        (await containsManagedInstructions(join(root, "AGENTS.md"))) ||
        (await containsTerseForgeSkill(join(root, ".agents", "skills", "terseforge", "SKILL.md"))),
      detail: "native project skill or AGENTS.md plus explicit CLI; automatic interception is not claimed"
    },
    {
      name: "Gemini CLI",
      level: "native-limited",
      installed:
        (await containsManagedInstructions(join(root, "GEMINI.md"))) ||
        (await containsTerseForgeSkill(join(root, ".gemini", "skills", "terseforge", "SKILL.md"))),
      detail: "native project skill or GEMINI.md plus explicit CLI; automatic interception is not claimed"
    },
    {
      name: "Cursor / Windsurf / Cline",
      level: "instructions-only",
      installed:
        (await containsManagedInstructions(join(root, ".cursor", "rules", "terseforge.mdc"))) ||
        (await containsManagedInstructions(join(root, ".windsurf", "rules", "terseforge.md"))) ||
        (await containsManagedInstructions(join(root, ".clinerules", "terseforge.md"))),
      detail: "rule files only"
    }
  ];

  return { ok: checks.every((check) => !check.required || check.ok), checks, integrations };
}

export async function readIntegrationAsset(name: string): Promise<string> {
  if (!(INTEGRATION_ASSETS as readonly string[]).includes(name)) throw new Error(`Invalid integration asset: ${name}`);
  return readFile(join(ASSET_ROOT, name), "utf8");
}
