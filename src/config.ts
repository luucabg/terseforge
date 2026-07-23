import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const PRESETS = ["safe", "lean", "ultra"] as const;
export type Preset = (typeof PRESETS)[number];

const executableSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !/[;&|><`$\r\n]/u.test(value), "command must be a single executable, not a shell expression");

const qualityGateSchema = z.object({
  name: z.string().min(1).max(80),
  command: executableSchema,
  args: z.array(z.string().max(4_096)).max(100),
  required: z.boolean(),
  timeoutMs: z.number().int().min(100).max(3_600_000)
});

export const configSchema = z.object({
  schemaVersion: z.literal(1),
  preset: z.enum(PRESETS),
  telemetry: z.literal(false),
  context: z.object({
    budgetTokens: z.number().int().min(100).max(100_000),
    maxFileBytes: z.number().int().min(1_024).max(10_000_000)
  }),
  output: z.object({
    artifactRetentionDays: z.number().int().min(1).max(365)
  }),
  qualityGates: z.array(qualityGateSchema).max(20)
});

export type TerseForgeConfig = z.infer<typeof configSchema>;

export const CONFIG_FILE = "terseforge.config.json";

export function createDefaultConfig(): TerseForgeConfig {
  return {
    schemaVersion: 1,
    preset: "safe",
    telemetry: false,
    context: {
      budgetTokens: 1_200,
      maxFileBytes: 200_000
    },
    output: {
      artifactRetentionDays: 30
    },
    qualityGates: [
      { name: "typecheck", command: "npm", args: ["run", "typecheck"], required: true, timeoutMs: 120_000 },
      { name: "lint", command: "npm", args: ["run", "lint"], required: true, timeoutMs: 120_000 },
      { name: "test", command: "npm", args: ["run", "test"], required: true, timeoutMs: 300_000 },
      { name: "build", command: "npm", args: ["run", "build"], required: true, timeoutMs: 180_000 }
    ]
  };
}

function parseConfig(value: unknown): TerseForgeConfig {
  const result = configSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid TerseForge configuration: ${details}`);
  }
  return result.data;
}

export async function writeConfig(root: string, value: unknown): Promise<string> {
  const config = parseConfig(value);
  await mkdir(root, { recursive: true });
  const target = join(root, CONFIG_FILE);
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return target;
}

export async function loadConfig(root: string): Promise<TerseForgeConfig> {
  const target = join(root, CONFIG_FILE);
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No ${CONFIG_FILE} found in ${root}. Run "terseforge init" first.`, { cause: error });
    }
    throw error;
  }

  try {
    return parseConfig(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${target}: ${error.message}`, { cause: error });
    }
    throw error;
  }
}

export async function setPreset(root: string, preset: Preset): Promise<TerseForgeConfig> {
  if (!(PRESETS as readonly string[]).includes(preset)) throw new Error(`Unknown preset: ${preset}`);
  const config = await loadConfig(root);
  const changed = { ...config, preset };
  await writeConfig(root, changed);
  return changed;
}
