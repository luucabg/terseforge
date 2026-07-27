import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const PRUNING_ADAPTERS = ["generic", "typescript", "eslint", "vitest", "jest"] as const;
export type PruningAdapter = (typeof PRUNING_ADAPTERS)[number];

export interface DiagnosticClassification {
  diagnostic: boolean;
  key: string;
  contextBefore: number;
  contextAfter: number;
}

const GENERIC_DIAGNOSTIC = /(?:\berror\b|\bwarn(?:ing)?\b|\bfail(?:ed|ure)?\b|\bfatal\b|\bexception\b|\bpanic\b|\bERR_[A-Z_]+\b|\bTS\d{4}\b|\bnot ok\b|\bassert(?:ion)?\b|\btraceback\b|\b[A-Za-z]+(?:Error|Exception):)/iu;
const TEST_BLOCK = /^\s*(?:FAIL\b|[●×✕✖❯]|AssertionError\b|expect\(|Expected:|Received:|[-+]\s+(?:Expected|Received))/iu;
const TYPESCRIPT_DIAGNOSTIC = /(?:\berror\s+TS\d{4}\b|\bTS\d{4}\b|\bFound\s+\d+\s+errors?\b)/iu;
const ESLINT_DIAGNOSTIC = /(?:^\s*\d+:\d+\s+(?:error|warning)\b|\bproblems?\s*\(\d+\s+errors?)/iu;
const VITEST_DIAGNOSTIC = /(?:^\s*FAIL\s+.+>|\bTest Files?\b.*\bfailed\b|\bTests?\b.*\bfailed\b|AssertionError)/iu;
const JEST_DIAGNOSTIC = /(?:^\s*FAIL\s+|^\s*●\s+|expect\(|\bTest Suites?\b.*\bfailed\b|\bTests?\b.*\bfailed\b)/iu;
const ZERO_FAILURE_SUMMARY = /\b0\s+(?:failed|failures?|errors?)\b/iu;

function stripAnsi(line: string): string {
  let result = "";
  for (let index = 0; index < line.length; index += 1) {
    const code = line.charCodeAt(index);
    if (code !== 0x1b && code !== 0x9b) {
      result += line[index] ?? "";
      continue;
    }

    const csi = code === 0x9b || line[index + 1] === "[";
    if (csi) {
      if (code === 0x1b) index += 1;
      while (index + 1 < line.length) {
        index += 1;
        const next = line.charCodeAt(index);
        if (next >= 0x40 && next <= 0x7e) break;
      }
      continue;
    }

    if (line[index + 1] === "]") {
      index += 2;
      while (index < line.length && line.charCodeAt(index) !== 0x07) {
        if (line.charCodeAt(index) === 0x1b && line[index + 1] === "\\") {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    index += 1;
  }
  return result;
}

export function normalizeDiagnosticLine(line: string): string {
  return stripAnsi(line).trimEnd();
}

export function classifyDiagnostic(line: string, adapter: PruningAdapter): DiagnosticClassification {
  const normalized = normalizeDiagnosticLine(line);
  if (ZERO_FAILURE_SUMMARY.test(normalized) && !/\b(?:warning|fatal|panic|exception)\b/iu.test(normalized)) {
    return { diagnostic: false, key: normalized, contextBefore: 0, contextAfter: 0 };
  }

  const testBlock = TEST_BLOCK.test(normalized);
  const adapterMatch =
    adapter === "typescript"
      ? TYPESCRIPT_DIAGNOSTIC.test(normalized)
      : adapter === "eslint"
        ? ESLINT_DIAGNOSTIC.test(normalized)
        : adapter === "vitest"
          ? VITEST_DIAGNOSTIC.test(normalized)
          : adapter === "jest"
            ? JEST_DIAGNOSTIC.test(normalized)
            : false;
  const diagnostic = adapterMatch || testBlock || GENERIC_DIAGNOSTIC.test(normalized);
  const testContext = testBlock || ((adapter === "vitest" || adapter === "jest") && diagnostic);
  return {
    diagnostic,
    key: normalized,
    contextBefore: testContext ? 4 : adapter === "typescript" || adapter === "eslint" ? 2 : 3,
    contextAfter: testContext ? 14 : adapter === "typescript" ? 5 : adapter === "eslint" ? 3 : 4
  };
}

function adapterFromText(value: string): PruningAdapter | undefined {
  const normalized = value.toLowerCase();
  if (/(?:^|[\s/\\])vitest(?:$|[\s/\\])/u.test(normalized)) return "vitest";
  if (/(?:^|[\s/\\])jest(?:$|[\s/\\])/u.test(normalized)) return "jest";
  if (/(?:^|[\s/\\])eslint(?:$|[\s/\\])/u.test(normalized)) return "eslint";
  if (/(?:^|[\s/\\])(?:tsc|typescript)(?:$|[\s/\\])/u.test(normalized)) return "typescript";
  return undefined;
}

async function packageScript(root: string, name: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { scripts?: Record<string, unknown> };
    const value = parsed.scripts?.[name];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function packageScriptName(executable: string, args: string[]): string | undefined {
  if (executable === "npm") return args[0] === "test" ? "test" : args[0] === "run" ? args[1] : undefined;
  if (["pnpm", "yarn", "bun"].includes(executable)) return args[0] === "run" ? args[1] : args[0];
  return undefined;
}

export async function detectPruningAdapter(root: string, command: string, args: string[]): Promise<PruningAdapter> {
  const executable = basename(command).toLowerCase().replace(/\.(?:cmd|exe)$/u, "");
  const direct = adapterFromText([executable, ...args.slice(0, 2)].join(" "));
  if (direct) return direct;

  const scriptName = packageScriptName(executable, args);
  if (scriptName) {
    const script = await packageScript(root, scriptName);
    const detected = script ? adapterFromText(script) : undefined;
    if (detected) return detected;
  }
  return "generic";
}
