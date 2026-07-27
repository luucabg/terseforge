import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import createIgnore from "ignore";
import ts from "typescript";
import { ensureStateDirectories, statePath } from "./storage.js";

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

export interface ContextIndexStats {
  discoveredFiles: number;
  parsedFiles: number;
  reusedFiles: number;
  deletedFiles: number;
}

export interface IndexedSource {
  summary: FileSummary;
  searchTerms: string[];
  fingerprint: {
    size: number;
    mtimeMs: number;
    ctimeMs: number;
  };
}

interface StoredContextIndex {
  schemaVersion: 1;
  generatedAt: string;
  entries: IndexedSource[];
}

export function posixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function contextIndexPath(root: string): string {
  return join(statePath(resolve(root)), "cache", "context-index-v1.json");
}

async function gitCandidateFiles(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 100_000_000,
      windowsHide: true
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

function importsFromSource(source: ts.SourceFile): string[] {
  const imports = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      imports.add(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)) {
      const firstArgument = node.arguments[0];
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if ((dynamicImport || requireCall) && firstArgument && ts.isStringLiteralLike(firstArgument)) imports.add(firstArgument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...imports];
}

export function tokenizeContextSearch(value: string): string[] {
  const terms = new Set<string>();
  for (const match of value.matchAll(/[\p{L}\p{N}_$-]+/gu)) {
    const token = match[0];
    if (!token) continue;
    const normalized = token.toLowerCase();
    if (normalized.length > 1) terms.add(normalized);
    const separated = token.replace(/([a-z\d])([A-Z])/gu, "$1 $2");
    for (const part of separated.split(/[_$\s-]+/u)) {
      const lower = part.toLowerCase();
      if (lower.length > 1) terms.add(lower);
    }
  }
  return [...terms];
}

function parseSource(path: string, content: string, fingerprint: IndexedSource["fingerprint"]): IndexedSource {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKind(path));
  return {
    summary: {
      path,
      imports: importsFromSource(source),
      symbols: source.statements.flatMap((statement) => symbolFromNode(statement, source))
    },
    searchTerms: tokenizeContextSearch(content),
    fingerprint
  };
}

function validSymbol(value: unknown): value is SymbolSummary {
  if (typeof value !== "object" || value === null) return false;
  const symbol = value as Partial<SymbolSummary>;
  return typeof symbol.name === "string" && typeof symbol.kind === "string" && Number.isSafeInteger(symbol.line) && (symbol.line ?? 0) > 0;
}

function validEntry(value: unknown): value is IndexedSource {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<IndexedSource>;
  const fingerprint = entry.fingerprint as Partial<IndexedSource["fingerprint"]> | undefined;
  return (
    typeof entry.summary?.path === "string" &&
    Array.isArray(entry.summary.imports) &&
    entry.summary.imports.every((item) => typeof item === "string") &&
    Array.isArray(entry.summary.symbols) &&
    entry.summary.symbols.every(validSymbol) &&
    Array.isArray(entry.searchTerms) &&
    entry.searchTerms.every((item) => typeof item === "string") &&
    typeof fingerprint?.size === "number" &&
    typeof fingerprint.mtimeMs === "number" &&
    typeof fingerprint.ctimeMs === "number"
  );
}

async function readStoredIndex(root: string): Promise<StoredContextIndex | undefined> {
  try {
    const value = JSON.parse(await readFile(contextIndexPath(root), "utf8")) as unknown;
    if (typeof value !== "object" || value === null) return undefined;
    const index = value as Partial<StoredContextIndex>;
    if (index.schemaVersion !== 1 || !Array.isArray(index.entries) || !index.entries.every(validEntry)) return undefined;
    return { schemaVersion: 1, generatedAt: typeof index.generatedAt === "string" ? index.generatedAt : "unknown", entries: index.entries };
  } catch {
    return undefined;
  }
}

function sameFingerprint(left: IndexedSource["fingerprint"], right: IndexedSource["fingerprint"]): boolean {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function writeStoredIndex(root: string, entries: IndexedSource[]): Promise<void> {
  await ensureStateDirectories(root);
  const target = contextIndexPath(root);
  const temporary = join(statePath(root), "cache", `.context-index-${randomBytes(6).toString("hex")}.tmp`);
  const value: StoredContextIndex = { schemaVersion: 1, generatedAt: new Date().toISOString(), entries };
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function loadContextIndex(
  root: string,
  maxFileBytes: number
): Promise<{ entries: IndexedSource[]; stats: ContextIndexStats }> {
  const resolvedRoot = resolve(root);
  const candidates = await sourceFiles(resolvedRoot);
  const stored = await readStoredIndex(resolvedRoot);
  const previous = new Map((stored?.entries ?? []).map((entry) => [entry.summary.path, entry]));
  const entries: IndexedSource[] = [];
  let parsedFiles = 0;
  let reusedFiles = 0;

  for (const path of candidates) {
    const absolute = resolve(resolvedRoot, path);
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink() || !info.isFile() || info.size > maxFileBytes) continue;
      const fingerprint = { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
      const cached = previous.get(path);
      if (cached && sameFingerprint(cached.fingerprint, fingerprint)) {
        entries.push(cached);
        reusedFiles += 1;
      } else {
        entries.push(parseSource(path, await readFile(absolute, "utf8"), fingerprint));
        parsedFiles += 1;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  entries.sort((left, right) => left.summary.path.localeCompare(right.summary.path));
  const current = new Set(entries.map((entry) => entry.summary.path));
  const deletedFiles = [...previous.keys()].filter((path) => !current.has(path)).length;
  if (!stored || parsedFiles > 0 || deletedFiles > 0) await writeStoredIndex(resolvedRoot, entries);

  return {
    entries,
    stats: { discoveredFiles: entries.length, parsedFiles, reusedFiles, deletedFiles }
  };
}

export function compilerOptionsForRoot(root: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(resolve(root), (path) => ts.sys.fileExists(path));
  if (!configPath) return { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const loaded = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (loaded.error) return { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
  return ts.parseJsonConfigFileContent(loaded.config, ts.sys, dirname(configPath)).options;
}

export function moduleAliases(path: string): string[] {
  const extension = extname(path);
  const withoutExtension = extension ? path.slice(0, -extension.length) : path;
  return withoutExtension.endsWith("/index") ? [withoutExtension, withoutExtension.slice(0, -"/index".length)] : [withoutExtension];
}

export function resolveIndexedImport(
  root: string,
  fromPath: string,
  specifier: string,
  aliases: Map<string, string>,
  compilerOptions: ts.CompilerOptions
): string | undefined {
  if (specifier.startsWith(".")) {
    const candidate = posix.normalize(posix.join(posix.dirname(posixPath(fromPath)), specifier));
    const extension = extname(candidate);
    const withoutExtension = extension ? candidate.slice(0, -extension.length) : candidate;
    const relativeMatch = aliases.get(withoutExtension) ?? aliases.get(`${withoutExtension}/index`);
    if (relativeMatch) return relativeMatch;
  }

  const resolved = ts.resolveModuleName(specifier, resolve(root, fromPath), compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
  if (!resolved) return undefined;
  const nativeRelativePath = relative(resolve(root), resolved);
  if (!nativeRelativePath || isAbsolute(nativeRelativePath) || nativeRelativePath === ".." || nativeRelativePath.startsWith(`..${posix.sep}`) || nativeRelativePath.startsWith("../") || nativeRelativePath.startsWith("..\\")) return undefined;
  const relativePath = posixPath(nativeRelativePath);
  const extension = extname(relativePath);
  const withoutExtension = extension ? relativePath.slice(0, -extension.length) : relativePath;
  return aliases.get(withoutExtension) ?? aliases.get(`${withoutExtension}/index`);
}
