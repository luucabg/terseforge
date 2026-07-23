import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { extname, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import createIgnore from "ignore";
import ts from "typescript";

const execFileAsync = promisify(execFile);
const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const GENERATED_SEGMENTS = new Set(["node_modules", "dist", "build", "coverage", ".git", ".terseforge"]);
const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.terseforge/**",
  "**/*.min.js",
  "**/*.d.ts"
];
const MAX_SNIPPETS_PER_FILE = 3;

export interface SymbolSummary {
  name: string;
  kind: string;
  line: number;
}

export interface FileSummary {
  path: string;
  imports: string[];
  symbols: SymbolSummary[];
}

export interface RepositoryMap {
  root: string;
  files: FileSummary[];
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
}

interface LoadedSource {
  summary: FileSummary;
  content: string;
}

function posixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

async function gitCandidateFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 100_000_000
    });
    const files = [...new Set(stdout.split("\0").filter(Boolean).map(posixPath))];
    return files.length > 0 ? files : undefined;
  } catch {
    return undefined;
  }
}

async function ignoredMatcher(root: string): Promise<ReturnType<typeof createIgnore>> {
  const matcher = createIgnore();
  try {
    matcher.add(await readFile(resolve(root, ".gitignore"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return matcher;
}

async function sourceFiles(root: string): Promise<string[]> {
  const gitFiles = await gitCandidateFiles(root);
  const candidates = gitFiles ?? (await fg("**/*.{ts,tsx,js,jsx,mjs,cjs}", { cwd: root, onlyFiles: true, dot: false, ignore: DEFAULT_IGNORES }));
  const matcher = await ignoredMatcher(root);
  return candidates
    .map(posixPath)
    .filter((path) => SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase()))
    .filter((path) => !path.split("/").some((segment) => GENERATED_SEGMENTS.has(segment)))
    .filter((path) => !matcher.ignores(path))
    .filter((path) => !path.endsWith(".d.ts") && !path.endsWith(".min.js"))
    .sort((left, right) => left.localeCompare(right));
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function symbolFromNode(node: ts.Node, source: ts.SourceFile): SymbolSummary[] {
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  if (ts.isFunctionDeclaration(node) && node.name) return [{ name: node.name.text, kind: "function", line }];
  if (ts.isClassDeclaration(node) && node.name) return [{ name: node.name.text, kind: "class", line }];
  if (ts.isInterfaceDeclaration(node)) return [{ name: node.name.text, kind: "interface", line }];
  if (ts.isTypeAliasDeclaration(node)) return [{ name: node.name.text, kind: "type", line }];
  if (ts.isEnumDeclaration(node)) return [{ name: node.name.text, kind: "enum", line }];
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [{ name: declaration.name.text, kind: "variable", line }] : []
    );
  }
  return [];
}

async function loadSources(root: string, maxFileBytes: number): Promise<LoadedSource[]> {
  const loaded: LoadedSource[] = [];
  for (const path of await sourceFiles(root)) {
    const absolute = resolve(root, path);
    try {
      const fileInfo = await lstat(absolute);
      if (fileInfo.isSymbolicLink() || !fileInfo.isFile() || fileInfo.size > maxFileBytes) continue;
      const content = await readFile(absolute, "utf8");
      const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind(path));
      const imports = source.statements.flatMap((statement) => {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
        return [statement.moduleSpecifier.text];
      });
      const symbols = source.statements.flatMap((statement) => symbolFromNode(statement, source));
      loaded.push({ summary: { path, imports, symbols }, content });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return loaded;
}

export async function buildRepositoryMap(root: string, maxFileBytes = 200_000): Promise<RepositoryMap> {
  const loaded = await loadSources(root, maxFileBytes);
  return { root: resolve(root), files: loaded.map((file) => file.summary) };
}

function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}_$-]+/u).filter((term) => term.length > 1);
}

function scoreFile(file: FileSummary, content: string, terms: string[], symbol?: string): number {
  const lowerPath = file.path.toLowerCase();
  const lowerContent = content.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lowerPath.includes(term)) score += 20;
    if (file.imports.some((item) => item.toLowerCase().includes(term))) score += 8;
    if (file.symbols.some((item) => item.name.toLowerCase().includes(term))) score += 30;
    if (lowerContent.includes(term)) score += 3;
  }
  if (symbol) {
    const lowerSymbol = symbol.toLowerCase();
    if (file.symbols.some((item) => item.name.toLowerCase() === lowerSymbol)) score += 100;
    else if (lowerContent.includes(lowerSymbol)) score += 25;
  }
  return score;
}

function moduleAliases(path: string): string[] {
  const extension = extname(path);
  const withoutExtension = extension ? path.slice(0, -extension.length) : path;
  return withoutExtension.endsWith("/index") ? [withoutExtension, withoutExtension.slice(0, -"/index".length)] : [withoutExtension];
}

function resolveRelativeImport(fromPath: string, specifier: string, aliases: Map<string, string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const candidate = posix.normalize(posix.join(posix.dirname(posixPath(fromPath)), specifier));
  const extension = extname(candidate);
  const withoutExtension = extension ? candidate.slice(0, -extension.length) : candidate;
  return aliases.get(withoutExtension) ?? aliases.get(`${withoutExtension}/index`);
}

function expandImportScores(loaded: LoadedSource[], scores: Map<string, number>): void {
  const aliases = new Map<string, string>();
  for (const file of loaded) for (const alias of moduleAliases(file.summary.path)) aliases.set(alias, file.summary.path);
  const initiallyRelevant = new Set([...scores.entries()].filter(([, score]) => score > 0).map(([path]) => path));
  for (const file of loaded) {
    for (const specifier of file.summary.imports) {
      const imported = resolveRelativeImport(file.summary.path, specifier, aliases);
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
  const budgetTokens = options.budgetTokens ?? 1_200;
  const loaded = await loadSources(root, options.maxFileBytes ?? 200_000);
  const terms = queryTerms(options.query);
  const scores = new Map(loaded.map((file) => [file.summary.path, scoreFile(file.summary, file.content, terms, options.symbol)]));
  expandImportScores(loaded, scores);
  const ranked = loaded
    .map((file) => ({ ...file, score: scores.get(file.summary.path) ?? 0 }))
    .filter((file) => file.score > 0)
    .sort((left, right) => right.score - left.score || left.summary.path.localeCompare(right.summary.path));

  const snippets: ContextSnippet[] = [];
  let usedTokens = 0;
  for (const candidate of ranked) {
    const lines = candidate.content.split(/\r?\n/u);
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
  return { snippets, text: snippets.map((snippet) => snippet.text).join("\n\n"), estimatedTokens: usedTokens };
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
