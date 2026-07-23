import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Preset } from "./config.js";

export type RunKind = "exec" | "gate";
export type ArtifactChannel = "merged" | "stdout" | "stderr" | "events";
export type RecordedGateStatus = "passed" | "failed" | "timed_out" | "not_configured";

export interface RunMetric {
  schemaVersion: 1;
  id: string;
  kind: RunKind;
  preset: Preset;
  command: string;
  exitCode: number | null;
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
  forcedTermination?: boolean;
  terminationFailed?: boolean;
  stdoutBytes?: number;
  stderrBytes?: number;
  checkId?: string;
  checkGateIndex?: number;
  checkGateCount?: number;
  checkCompleted?: boolean;
  gateName?: string;
  gateRequired?: boolean;
  gateStatus?: RecordedGateStatus;
}

export interface ArtifactWriter {
  path: string;
  write(chunk: string | Buffer): Promise<void>;
  close(): Promise<void>;
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/u;
const ARTIFACT_SUFFIXES: Record<ArtifactChannel, string> = {
  merged: ".log",
  stdout: ".stdout.log",
  stderr: ".stderr.log",
  events: ".events.jsonl"
};

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

export function artifactPath(root: string, id: string, channel: ArtifactChannel = "merged"): string {
  validateRunId(id);
  if (!Object.hasOwn(ARTIFACT_SUFFIXES, channel)) throw new Error(`Invalid artifact channel: ${channel}`);
  return join(statePath(root), "artifacts", `${id}${ARTIFACT_SUFFIXES[channel]}`);
}

export async function createArtifactWriter(root: string, id: string, channel: ArtifactChannel = "merged"): Promise<ArtifactWriter> {
  validateRunId(id);
  await ensureStateDirectories(root);
  const path = artifactPath(root, id, channel);
  const handle = await open(path, "wx", 0o600);
  const stream = handle.createWriteStream();
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

export async function readArtifact(root: string, id: string, channel: ArtifactChannel = "merged"): Promise<string> {
  return readFile(artifactPath(root, id, channel), "utf8");
}

export async function readArtifactBytes(root: string, id: string, channel: ArtifactChannel = "merged"): Promise<Buffer> {
  return readFile(artifactPath(root, id, channel));
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
  const metrics: RunMetric[] = [];
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    try {
      const value = JSON.parse(line) as unknown;
      if (isRunMetric(value)) metrics.push(value);
    } catch {
      // A damaged historical record must not make every later metric unreadable.
    }
  }
  return metrics;
}

function isRunMetric(value: unknown): value is RunMetric {
  if (typeof value !== "object" || value === null) return false;
  const metric = value as Partial<RunMetric>;
  const numeric = [
    metric.durationMs,
    metric.rawBytes,
    metric.rawLines,
    metric.visibleBytes,
    metric.visibleLines,
    metric.omittedLines,
    metric.estimatedInputTokens,
    metric.estimatedVisibleTokens
  ];
  return (
    metric.schemaVersion === 1 &&
    typeof metric.id === "string" &&
    (metric.kind === "exec" || metric.kind === "gate") &&
    (metric.preset === "safe" || metric.preset === "lean" || metric.preset === "ultra") &&
    typeof metric.command === "string" &&
    (metric.exitCode === null || (typeof metric.exitCode === "number" && Number.isFinite(metric.exitCode))) &&
    typeof metric.startedAt === "string" &&
    numeric.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}
