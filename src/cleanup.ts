import { randomBytes } from "node:crypto";
import { lstat, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { join, posix, relative, resolve } from "node:path";
import { assertStateDirectorySafe, isRunMetric, statePath } from "./storage.js";

const MAX_RETENTION_DAYS = 3_650;

export interface CleanupOptions {
  olderThanDays: number;
  dryRun?: boolean;
  now?: Date;
}

export interface CleanupResult {
  cutoff: string;
  dryRun: boolean;
  files: number;
  metricRecords: number;
  bytes: number;
  paths: string[];
}

interface ExpiredFile {
  absolutePath: string;
  relativePath: string;
  bytes: number;
}

function validateOptions(options: CleanupOptions): number {
  if (!Number.isSafeInteger(options.olderThanDays) || options.olderThanDays < 1 || options.olderThanDays > MAX_RETENTION_DAYS) {
    throw new Error(`--older-than must be an integer from 1 to ${MAX_RETENTION_DAYS} days.`);
  }
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Cleanup time must be a valid date.");
  return now.getTime() - options.olderThanDays * 24 * 60 * 60 * 1_000;
}

function localPath(root: string, absolutePath: string): string {
  return posix.join(".terseforge", relative(statePath(root), absolutePath).replaceAll("\\", "/"));
}

async function collectExpiredFiles(root: string, directory: string, cutoffMs: number): Promise<ExpiredFile[]> {
  try {
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new Error(`Refusing cleanup because a state directory is a symbolic link: ${directory}`);
    if (!info.isDirectory()) return [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries = await readdir(directory, { withFileTypes: true });

  const expired: ExpiredFile[] = [];
  for (const entry of entries) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      expired.push(...(await collectExpiredFiles(root, target, cutoffMs)));
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    try {
      const info = await lstat(target);
      if (info.mtimeMs < cutoffMs) {
        expired.push({ absolutePath: target, relativePath: localPath(root, target), bytes: info.size });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return expired;
}

async function planMetricCleanup(root: string, cutoffMs: number): Promise<{ kept: string; removed: number; bytes: number } | undefined> {
  const target = join(statePath(root), "runs.jsonl");
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  const lines = raw.split("\n");
  const kept: string[] = [];
  let removed = 0;
  let bytes = 0;
  for (const original of lines) {
    const candidate = original.endsWith("\r") ? original.slice(0, -1) : original;
    let value: unknown;
    try {
      value = JSON.parse(candidate) as unknown;
    } catch {
      kept.push(original);
      continue;
    }
    const startedAt = isRunMetric(value) ? Date.parse(value.startedAt) : Number.NaN;
    if (Number.isFinite(startedAt) && startedAt < cutoffMs) {
      removed += 1;
      bytes += Buffer.byteLength(original) + 1;
    } else {
      kept.push(original);
    }
  }
  return { kept: kept.join("\n"), removed, bytes };
}

async function replaceMetrics(root: string, content: string): Promise<void> {
  const directory = statePath(root);
  const target = join(directory, "runs.jsonl");
  const temporary = join(directory, `.runs-${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function cleanLocalState(root: string, options: CleanupOptions): Promise<CleanupResult> {
  const resolvedRoot = resolve(root);
  const cutoffMs = validateOptions(options);
  const dryRun = options.dryRun ?? false;
  await assertStateDirectorySafe(resolvedRoot);
  const directories = [join(statePath(resolvedRoot), "artifacts"), join(statePath(resolvedRoot), "benchmarks")];
  const files = (await Promise.all(directories.map(async (directory) => collectExpiredFiles(resolvedRoot, directory, cutoffMs))))
    .flat()
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const metricPlan = await planMetricCleanup(resolvedRoot, cutoffMs);

  if (!dryRun) {
    for (const file of files) {
      try {
        await unlink(file.absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (metricPlan && metricPlan.removed > 0) await replaceMetrics(resolvedRoot, metricPlan.kept);
  }

  return {
    cutoff: new Date(cutoffMs).toISOString(),
    dryRun,
    files: files.length,
    metricRecords: metricPlan?.removed ?? 0,
    bytes: files.reduce((total, file) => total + file.bytes, metricPlan?.bytes ?? 0),
    paths: files.map((file) => file.relativePath)
  };
}
