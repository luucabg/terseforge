import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Preset } from "./config.js";

export type RunKind = "exec" | "gate";

export interface RunMetric {
  schemaVersion: 1;
  id: string;
  kind: RunKind;
  preset: Preset;
  command: string;
  exitCode: number;
  startedAt: string;
  durationMs: number;
  rawBytes: number;
  rawLines: number;
  visibleBytes: number;
  visibleLines: number;
  omittedLines: number;
  estimatedInputTokens: number;
  estimatedVisibleTokens: number;
  timedOut?: boolean;
}

export interface ArtifactWriter {
  path: string;
  write(chunk: string | Buffer): Promise<void>;
  close(): Promise<void>;
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/u;

export function createRunId(prefix = "run"): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function statePath(root: string): string {
  return join(root, ".terseforge");
}

export async function ensureStateDirectories(root: string): Promise<void> {
  await Promise.all([
    mkdir(join(statePath(root), "artifacts"), { recursive: true }),
    mkdir(join(statePath(root), "benchmarks"), { recursive: true }),
    mkdir(join(statePath(root), "integrations"), { recursive: true })
  ]);
}

function validateRunId(id: string): void {
  if (!RUN_ID_PATTERN.test(id)) throw new Error(`Invalid output identifier: ${id}`);
}

export function artifactPath(root: string, id: string): string {
  validateRunId(id);
  return join(statePath(root), "artifacts", `${id}.log`);
}

export async function createArtifactWriter(root: string, id: string): Promise<ArtifactWriter> {
  validateRunId(id);
  await ensureStateDirectories(root);
  const path = artifactPath(root, id);
  const handle = await open(path, "wx", 0o600);
  const stream = handle.createWriteStream({ encoding: "utf8" });
  let streamError: Error | undefined;
  stream.on("error", (error) => {
    streamError = error;
  });

  return {
    path,
    async write(chunk) {
      if (streamError) throw streamError;
      if (!stream.write(chunk)) await once(stream, "drain");
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        if (streamError) {
          reject(streamError);
          return;
        }
        stream.once("error", reject);
        stream.end(() => resolve());
      });
    }
  };
}

export async function readArtifact(root: string, id: string): Promise<string> {
  return readFile(artifactPath(root, id), "utf8");
}

export async function appendMetric(root: string, metric: RunMetric): Promise<void> {
  await ensureStateDirectories(root);
  await appendFile(join(statePath(root), "runs.jsonl"), `${JSON.stringify(metric)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function readMetrics(root: string): Promise<RunMetric[]> {
  let raw: string;
  try {
    raw = await readFile(join(statePath(root), "runs.jsonl"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return raw
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunMetric);
}
