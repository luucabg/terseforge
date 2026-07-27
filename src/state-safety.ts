import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import createIgnore from "ignore";

const STATE_IGNORE_RULE = "/.terseforge/";
const STATE_PROBE = ".terseforge/artifacts/terseforge-output.log";

async function readGitignore(root: string): Promise<string | undefined> {
  try {
    return await readFile(join(root, ".gitignore"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function isStateIgnored(root: string): Promise<boolean> {
  const content = await readGitignore(root);
  if (content === undefined) return false;
  try {
    return createIgnore().add(content).ignores(STATE_PROBE);
  } catch {
    return false;
  }
}

export async function ensureStateIgnored(root: string): Promise<"created" | "updated" | "present"> {
  const current = await readGitignore(root);
  if (current !== undefined) {
    try {
      if (createIgnore().add(current).ignores(STATE_PROBE)) return "present";
    } catch {
      // Preserve malformed existing rules and append one explicit safe rule.
    }
  }

  const existing = current ?? "";
  const lineEnding = existing.includes("\r\n") ? "\r\n" : "\n";
  const separator = existing.length > 0 && !existing.endsWith("\n") ? lineEnding : "";
  await writeFile(join(root, ".gitignore"), `${existing}${separator}${STATE_IGNORE_RULE}${lineEnding}`, "utf8");
  return current === undefined ? "created" : "updated";
}
