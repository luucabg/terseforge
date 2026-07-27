import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  compilerOptionsForRoot,
  loadContextIndex,
  moduleAliases,
  posixPath,
  resolveIndexedImport,
  tokenizeContextSearch,
  type ContextIndexStats,
  type FileSummary,
  type IndexedSource
} from "./context-index.js";

const MAX_SNIPPETS_PER_FILE = 3;

export type { ContextIndexStats, FileSummary, SymbolSummary } from "./context-index.js";
export { contextIndexPath } from "./context-index.js";

export interface RepositoryMap {
  root: string;
  files: FileSummary[];
  index?: ContextIndexStats;
}

export interface ContextSnippet {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  text: string;
}

export interface ContextResult {
  snippets: ContextSnippet[];
  text: string;
  estimatedTokens: number;
  index?: ContextIndexStats;
}

export async function buildRepositoryMap(root: string, maxFileBytes = 200_000): Promise<RepositoryMap> {
  const indexed = await loadContextIndex(root, maxFileBytes);
  return { root: resolve(root), files: indexed.entries.map((entry) => entry.summary), index: indexed.stats };
}

function scoreFile(file: IndexedSource, terms: string[], symbol?: string): number {
  const lowerPath = file.summary.path.toLowerCase();
  const indexedTerms = new Set(file.searchTerms);
  let score = 0;
  for (const term of terms) {
    if (lowerPath.includes(term)) score += 20;
    if (file.summary.imports.some((item) => item.toLowerCase().includes(term))) score += 8;
    if (file.summary.symbols.some((item) => item.name.toLowerCase().includes(term))) score += 30;
    if (indexedTerms.has(term)) score += 3;
  }
  if (symbol) {
    const lowerSymbol = symbol.toLowerCase();
    if (file.summary.symbols.some((item) => item.name.toLowerCase() === lowerSymbol)) score += 100;
    else if (indexedTerms.has(lowerSymbol)) score += 25;
  }
  return score;
}

function expandImportScores(root: string, indexed: IndexedSource[], scores: Map<string, number>): void {
  const aliases = new Map<string, string>();
  for (const file of indexed) for (const alias of moduleAliases(file.summary.path)) aliases.set(alias, file.summary.path);
  const compilerOptions = compilerOptionsForRoot(root);
  const initiallyRelevant = new Set([...scores.entries()].filter(([, score]) => score > 0).map(([path]) => path));
  for (const file of indexed) {
    for (const specifier of file.summary.imports) {
      const imported = resolveIndexedImport(root, file.summary.path, specifier, aliases, compilerOptions);
      if (!imported) continue;
      if (initiallyRelevant.has(file.summary.path)) scores.set(imported, Math.max(scores.get(imported) ?? 0, 12));
      if (initiallyRelevant.has(imported)) scores.set(file.summary.path, Math.max(scores.get(file.summary.path) ?? 0, 8));
    }
  }
}

function matchingLines(lines: string[], terms: string[], symbol?: string): number[] {
  const lowerSymbol = symbol?.toLowerCase();
  const matches: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lower = lines[index]?.toLowerCase() ?? "";
    if ((lowerSymbol && lower.includes(lowerSymbol)) || terms.some((term) => lower.includes(term))) matches.push(index);
  }
  return matches;
}

function snippetBody(path: string, lines: string[], start: number, end: number): { body: string; tokens: number } {
  const numbered = lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`);
  const body = `# ${path}\n${numbered.join("\n")}`;
  return { body, tokens: Math.ceil(Buffer.byteLength(body) / 4) };
}

function boundedSnippet(path: string, lines: string[], match: number, availableTokens: number): { start: number; end: number; body: string; tokens: number } | undefined {
  let start = match;
  let end = match + 1;
  let current = snippetBody(path, lines, start, end);
  if (current.tokens > availableTokens) return undefined;
  for (let distance = 1; distance <= 3; distance += 1) {
    if (match - distance >= 0) {
      const expanded = snippetBody(path, lines, match - distance, end);
      if (expanded.tokens <= availableTokens) {
        start = match - distance;
        current = expanded;
      }
    }
    if (match + distance < lines.length) {
      const expanded = snippetBody(path, lines, start, match + distance + 1);
      if (expanded.tokens <= availableTokens) {
        end = match + distance + 1;
        current = expanded;
      }
    }
  }
  return { start, end, body: current.body, tokens: current.tokens };
}

export async function selectContext(
  root: string,
  options: { query: string; symbol?: string; budgetTokens?: number; maxFileBytes?: number }
): Promise<ContextResult> {
  const resolvedRoot = resolve(root);
  const budgetTokens = options.budgetTokens ?? 1_200;
  const indexed = await loadContextIndex(resolvedRoot, options.maxFileBytes ?? 200_000);
  const terms = tokenizeContextSearch(options.query);
  const scores = new Map(indexed.entries.map((file) => [file.summary.path, scoreFile(file, terms, options.symbol)]));
  expandImportScores(resolvedRoot, indexed.entries, scores);
  const ranked = indexed.entries
    .map((file) => ({ ...file, score: scores.get(file.summary.path) ?? 0 }))
    .filter((file) => file.score > 0)
    .sort((left, right) => right.score - left.score || left.summary.path.localeCompare(right.summary.path));

  const snippets: ContextSnippet[] = [];
  let usedTokens = 0;
  for (const candidate of ranked) {
    let content: string;
    try {
      content = await readFile(resolve(resolvedRoot, candidate.summary.path), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const lines = content.split(/\r?\n/u);
    const matches = matchingLines(lines, terms, options.symbol);
    if (matches.length === 0) matches.push(Math.max(0, (candidate.summary.symbols[0]?.line ?? 1) - 1));
    const covered: Array<{ start: number; end: number }> = [];
    for (const match of matches) {
      if (covered.some((range) => match >= range.start && match < range.end)) continue;
      const snippet = boundedSnippet(candidate.summary.path, lines, match, budgetTokens - usedTokens);
      if (!snippet) continue;
      snippets.push({
        path: candidate.summary.path,
        startLine: snippet.start + 1,
        endLine: snippet.end,
        score: candidate.score,
        text: snippet.body
      });
      covered.push({ start: snippet.start, end: snippet.end });
      usedTokens += snippet.tokens;
      if (covered.length >= MAX_SNIPPETS_PER_FILE || usedTokens >= budgetTokens) break;
    }
    if (usedTokens >= budgetTokens) break;
  }
  return { snippets, text: snippets.map((snippet) => snippet.text).join("\n\n"), estimatedTokens: usedTokens, index: indexed.stats };
}

export function formatRepositoryMap(map: RepositoryMap, maxFiles = 500): string {
  if (map.files.length === 0) return "No supported TS/JS source files found.";
  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1) throw new Error("Map file limit must be a positive integer.");
  const visible = map.files.slice(0, maxFiles).map((file) => {
    const symbols = file.symbols.map((symbol) => `${symbol.kind} ${symbol.name}:${symbol.line}`).join(", ") || "no top-level symbols";
    const imports = file.imports.length > 0 ? ` imports ${file.imports.join(", ")}` : "";
    return `${file.path}: ${symbols}${imports}`;
  });
  const omitted = map.files.length - visible.length;
  if (omitted > 0) visible.push(`... ${omitted} more files omitted. Use terseforge context for targeted retrieval.`);
  return visible.join("\n");
}

export function relativeToRoot(root: string, path: string): string {
  return posixPath(relative(resolve(root), resolve(path)));
}
