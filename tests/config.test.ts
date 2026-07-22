import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultConfig, loadConfig, writeConfig } from "../src/config.js";

describe("configuration", () => {
  it("defaults to the conservative safe preset", () => {
    const config = createDefaultConfig();

    expect(config.preset).toBe("safe");
    expect(config.telemetry).toBe(false);
    expect(config.qualityGates.length).toBeGreaterThan(0);
  });

  it("round-trips a validated local configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-config-"));
    await writeConfig(root, createDefaultConfig());

    const config = await loadConfig(root);
    const raw = await readFile(join(root, "terseforge.config.json"), "utf8");

    expect(config.preset).toBe("safe");
    expect(JSON.parse(raw)).toMatchObject({ schemaVersion: 1, telemetry: false });
  });

  it("rejects remote telemetry and shell command strings", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-config-invalid-"));
    const config = createDefaultConfig();

    await expect(writeConfig(root, { ...config, telemetry: true })).rejects.toThrow(/telemetry/i);
    await expect(
      writeConfig(root, {
        ...config,
        qualityGates: [{ name: "bad", command: "npm test && echo unsafe", args: [], required: true, timeoutMs: 1_000 }]
      })
    ).rejects.toThrow(/command/i);
  });

  it("explains missing and malformed configuration files", async () => {
    const missing = await mkdtemp(join(tmpdir(), "terseforge-config-missing-"));
    await expect(loadConfig(missing)).rejects.toThrow(/init/iu);

    const malformed = await mkdtemp(join(tmpdir(), "terseforge-config-malformed-"));
    await writeFile(join(malformed, "terseforge.config.json"), "{not-json", "utf8");
    await expect(loadConfig(malformed)).rejects.toThrow(/invalid json/iu);
  });
});
