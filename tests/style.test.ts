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
});
