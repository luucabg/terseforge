import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
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

function posixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

async function gitTrackedFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 10_000_000 });
    const files = stdout.split("\0").filter(Boolean).map(posixPath);
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
  const tracked = await gitTrackedFiles(root);
  const candidates = tracked ?? (await fg("**/*.{ts,tsx,js,jsx,mjs,cjs}", { cwd: root, onlyFiles: true, dot: false, ignore: DEFAULT_IGNORES }));
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

export async function buildRepositoryMap(root: string, maxFileBytes = 200_000): Promise<RepositoryMap> {
  const files: FileSummary[] = [];
  for (const path of await sourceFiles(root)) {
    const absolute = resolve(root, path);
    const fileInfo = await lstat(absolute);
    if (fileInfo.isSymbolicLink() || fileInfo.size > maxFileBytes) continue;
    const content = await readFile(absolute, "utf8");
    const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind(path));
    const imports = source.statements.flatMap((statement) => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
      return [statement.moduleSpecifier.text];
    });
    const symbols = source.statements.flatMap((statement) => symbolFromNode(statement, source));
    files.push({ path, imports, symbols });
  }
  return { root: resolve(root), files };
}

function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9_$-]+/u).filter((term) => term.length > 1);
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

export async function selectContext(
  root: string,
  options: { query: string; symbol?: string; budgetTokens?: number; maxFileBytes?: number }
): Promise<ContextResult> {
  const budgetTokens = options.budgetTokens ?? 1_200;
  const repositoryMap = await buildRepositoryMap(root, options.maxFileBytes);
  const terms = queryTerms(options.query);
  const ranked: Array<{ file: FileSummary; content: string; score: number }> = [];
  for (const file of repositoryMap.files) {
    const content = await readFile(resolve(root, file.path), "utf8");
    const score = scoreFile(file, content, terms, options.symbol);
    if (score > 0) ranked.push({ file, content, score });
  }
  ranked.sort((left, right) => right.score - left.score || left.file.path.localeCompare(right.file.path));

  const snippets: ContextSnippet[] = [];
  let usedTokens = 0;
  for (const candidate of ranked) {
    const lines = candidate.content.split(/\r?\n/u);
    const needle = options.symbol?.toLowerCase();
    let match = needle ? lines.findIndex((line) => line.toLowerCase().includes(needle)) : -1;
    if (match < 0) match = lines.findIndex((line) => terms.some((term) => line.toLowerCase().includes(term)));
    if (match < 0) match = Math.max(0, (candidate.file.symbols[0]?.line ?? 1) - 1);
    const start = Math.max(0, match - 3);
    const end = Math.min(lines.length, match + 4);
    const numbered = lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`);
    let body = `# ${candidate.file.path}\n${numbered.join("\n")}`;
    let tokens = Math.ceil(Buffer.byteLength(body) / 4);
    while (numbered.length > 1 && usedTokens + tokens > budgetTokens) {
      numbered.pop();
      body = `# ${candidate.file.path}\n${numbered.join("\n")}`;
      tokens = Math.ceil(Buffer.byteLength(body) / 4);
    }
    if (usedTokens + tokens > budgetTokens) continue;
    snippets.push({ path: candidate.file.path, startLine: start + 1, endLine: start + numbered.length, score: candidate.score, text: body });
    usedTokens += tokens;
    if (usedTokens >= budgetTokens) break;
  }
  return { snippets, text: snippets.map((snippet) => snippet.text).join("\n\n"), estimatedTokens: usedTokens };
}

export function formatRepositoryMap(map: RepositoryMap): string {
  if (map.files.length === 0) return "No supported TS/JS source files found.";
  return map.files
    .map((file) => {
      const symbols = file.symbols.map((symbol) => `${symbol.kind} ${symbol.name}:${symbol.line}`).join(", ") || "no top-level symbols";
      const imports = file.imports.length > 0 ? ` imports ${file.imports.join(", ")}` : "";
      return `${file.path}: ${symbols}${imports}`;
    })
    .join("\n");
}

export function relativeToRoot(root: string, path: string): string {
  return posixPath(relative(resolve(root), resolve(path)));
}
