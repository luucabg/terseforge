import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { promisify } from "node:util";
import { buildRepositoryMap, formatRepositoryMap, relativeToRoot, selectContext } from "../src/context.js";

const execFileAsync = promisify(execFile);

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "terseforge-context-"));
  await mkdir(join(root, "src"));
  await writeFile(
    join(root, "src", "auth.ts"),
    [
      'import { decode } from "./jwt.js";',
      "export interface Session { userId: string }",
      "export function validateToken(token: string): Session {",
      "  return decode(token);",
      "}"
    ].join("\n"),
    "utf8"
  );
  await writeFile(join(root, "src", "jwt.ts"), "export const decode = (value: string) => ({ userId: value });\n", "utf8");
  await writeFile(join(root, "package-lock.json"), "{\"lockfileVersion\":3}\n", "utf8");
  return root;
}

describe("progressive TS/JS context", () => {
  it("maps imports and top-level symbols while excluding lockfiles", async () => {
    const root = await createFixture();
    const map = await buildRepositoryMap(root);

    expect(map.files.map((file) => file.path)).toEqual(["src/auth.ts", "src/jwt.ts"]);
    expect(map.files[0]?.imports).toContain("./jwt.js");
    expect(map.files[0]?.symbols.map((symbol) => symbol.name)).toEqual(
      expect.arrayContaining(["Session", "validateToken"])
    );
  });

  it("ranks symbol matches and emits bounded numbered snippets", async () => {
    const root = await createFixture();
    const result = await selectContext(root, { query: "token validation", symbol: "validateToken", budgetTokens: 100 });

    expect(result.snippets[0]?.path).toBe("src/auth.ts");
    expect(result.text).toContain("3: export function validateToken");
    expect(result.estimatedTokens).toBeLessThanOrEqual(100);
  });

  it("recognizes supported script kinds and all top-level declaration kinds", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-context-kinds-"));
    await writeFile(
      join(root, "kinds.tsx"),
      [
        "export class Widget {}",
        "export type WidgetId = string;",
        "export enum Mode { Safe }",
        "export const value = 1, { nested } = { nested: 2 };",
        "export default 1;"
      ].join("\n"),
      "utf8"
    );
    await writeFile(join(root, "view.jsx"), "export const View = () => <div />;\n", "utf8");
    await writeFile(join(root, "module.mjs"), "export const moduleValue = 1;\n", "utf8");
    await writeFile(join(root, "common.cjs"), "const commonValue = 1; module.exports = commonValue;\n", "utf8");
    await writeFile(join(root, "plain.js"), "export function plain() {}\n", "utf8");
    await writeFile(join(root, "empty.ts"), "export default 1;\n", "utf8");

    const map = await buildRepositoryMap(root);
    const kinds = map.files.flatMap((file) => file.symbols.map((symbol) => symbol.kind));

    expect(kinds).toEqual(expect.arrayContaining(["class", "type", "enum", "variable", "function"]));
    expect(map.files.map((file) => file.path)).toEqual(expect.arrayContaining(["view.jsx", "module.mjs", "common.cjs", "plain.js"]));
    expect(formatRepositoryMap(map)).toContain("no top-level symbols");
    expect(relativeToRoot(root, join(root, "view.jsx"))).toBe("view.jsx");
  });

  it("respects git tracking, gitignore, size caps, no-match results, and tight budgets", async () => {
    const root = await mkdtemp(join(tmpdir(), "terseforge-context-filter-"));
    await writeFile(join(root, ".gitignore"), "ignored.ts\n", "utf8");
    await writeFile(join(root, "tracked.ts"), 'import { thing } from "needle-package";\nexport const trackedNeedle = thing;\n', "utf8");
    await writeFile(join(root, "ignored.ts"), "export const ignoredNeedle = true;\n", "utf8");
    await writeFile(join(root, "large.ts"), `export const huge = "${"x".repeat(2_000)}";\n`, "utf8");
    await mkdir(join(root, "dist"));
    await writeFile(join(root, "dist", "generated.ts"), "export const generatedNeedle = true;\n", "utf8");
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "tracked.ts"), "export const dependencyNeedle = true;\n", "utf8");
    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["add", "tracked.ts"], { cwd: root });
    await execFileAsync("git", ["add", "-f", "ignored.ts", "large.ts", "dist/generated.ts", "node_modules/tracked.ts"], { cwd: root });

    const map = await buildRepositoryMap(root, 1_024);
    const noMatch = await selectContext(root, { query: "absent phrase" });
    const tight = await selectContext(root, { query: "needle", budgetTokens: 10 });
    const defaultBudget = await selectContext(root, { query: "needle" });

    expect(map.files.map((file) => file.path)).toEqual(["tracked.ts"]);
    expect(noMatch).toMatchObject({ snippets: [], text: "", estimatedTokens: 0 });
    expect(tight.estimatedTokens).toBeLessThanOrEqual(10);
    expect(defaultBudget.snippets[0]?.score).toBeGreaterThan(0);
    expect(formatRepositoryMap({ root, files: [] })).toContain("No supported");
  });
});
