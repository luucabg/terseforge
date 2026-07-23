import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fg from "fast-glob";
import { describe, expect, it } from "vitest";

describe("public copy", () => {
  it("uses plain punctuation instead of em dashes", async () => {
    const root = resolve(import.meta.dirname, "..");
    const files = await fg("**/*.{md,mdc,txt,json,ts,yml,yaml}", {
      cwd: root,
      onlyFiles: true,
      ignore: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/work/**", "package-lock.json"]
    });
    const forbidden = String.fromCodePoint(0x2014);
    const violations: string[] = [];

    for (const file of files) {
      const text = await readFile(resolve(root, file), "utf8");
      if (text.includes(forbidden)) violations.push(file);
    }

    expect(files.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("provides a safe, copyable prompt for agent-assisted installation", async () => {
    const root = resolve(import.meta.dirname, "..");
    const repository = "https://github.com/luucabg/terseforge";
    const [readme, guide, llms] = await Promise.all([
      readFile(resolve(root, "README.md"), "utf8"),
      readFile(resolve(root, "docs", "skills.md"), "utf8"),
      readFile(resolve(root, "llms.txt"), "utf8")
    ]);

    expect(readme).toContain(`[luucabg/terseforge](${repository})`);
    for (const text of [readme, guide]) {
      expect(text).toContain(`Install TerseForge from ${repository}`);
      expect(text).toContain("Install both the local CLI and the user-scoped Agent Skill");
      expect(text).toContain("Do not publish anything");
      expect(text).toContain("Activate TerseForge in this project.");
    }
    expect(llms).toContain(`Agent-assisted installation source: ${repository}`);
  });
});
