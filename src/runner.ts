import { execFile } from "node:child_process";
import { basename } from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { promisify } from "node:util";
import spawn from "cross-spawn";
import type { Preset } from "./config.js";
import { StreamingPruner } from "./pruning.js";
import {
  appendMetric,
  createArtifactWriter,
  createRunId,
  type ArtifactWriter,
  type RecordedGateStatus,
  type RunKind,
  type RunMetric
} from "./storage.js";

const execFileAsync = promisify(execFile);
const DEFAULT_TERMINATION_GRACE_MS = 2_000;

export interface RunProcessOptions {
  root: string;
  command: string;
  args: string[];
  preset: Preset;
  kind: RunKind;
  timeoutMs?: number;
  terminationGraceMs?: number;
  checkId?: string;
  checkGateIndex?: number;
  checkGateCount?: number;
  checkCompleted?: boolean;
  gateName?: string;
  gateRequired?: boolean;
}

export interface RunProcessResult {
  id: string;
  exitCode: number;
  visibleOutput: string;
  artifactPath: string;
  metric: RunMetric;
}

type Child = ReturnType<typeof spawn>;
type StreamName = "stdout" | "stderr";

function hasClosed(child: Child): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForClose(child: Child, timeoutMs: number): Promise<boolean> {
  if (hasClosed(child)) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (closed: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("close", onClose);
      resolve(closed);
    };
    const onClose = (): void => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref();
    child.once("close", onClose);
  });
}

async function signalProcessTree(child: Child, force: boolean, commandTimeoutMs = DEFAULT_TERMINATION_GRACE_MS): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    if (hasClosed(child)) return;
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])], {
        timeout: Math.max(50, commandTimeoutMs),
        windowsHide: true
      });
      return;
    } catch {
      if (!force) return;
      child.kill("SIGKILL");
      return;
    }
  }

  const signal = force ? "SIGKILL" : "SIGTERM";
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function closeWriters(writers: ArtifactWriter[]): Promise<void> {
  const results = await Promise.allSettled(writers.map(async (writer) => writer.close()));
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}

export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const id = createRunId(options.kind);
  const writers: ArtifactWriter[] = [];
  try {
    writers.push(await createArtifactWriter(options.root, id));
    writers.push(await createArtifactWriter(options.root, id, "stdout"));
    writers.push(await createArtifactWriter(options.root, id, "stderr"));
    writers.push(await createArtifactWriter(options.root, id, "events"));
  } catch (error) {
    await closeWriters(writers).catch(() => undefined);
    throw error;
  }
  const [writer, stdoutWriter, stderrWriter, eventWriter] = writers;
  if (!writer || !stdoutWriter || !stderrWriter || !eventWriter) {
    await closeWriters(writers).catch(() => undefined);
    throw new Error("Failed to initialize output artifacts.");
  }
  const pruner = new StreamingPruner(options.preset);
  let rawBytes = 0;
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const termination = { timedOut: false, forced: false, failed: false };
  let sequence = 0;
  const offsets: Record<StreamName, number> = { stdout: 0, stderr: 0 };
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  const pendingText: Record<StreamName, string> = { stdout: "", stderr: "" };
  let writeQueue = Promise.resolve();

  const schedule = (action: () => Promise<void> | void): Promise<void> => {
    const task = writeQueue.then(action);
    writeQueue = task;
    return task;
  };
  const pushDecoded = (stream: StreamName, text: string, flush = false): void => {
    const pieces = `${pendingText[stream]}${text}`.split("\n");
    pendingText[stream] = pieces.pop() ?? "";
    for (const piece of pieces) pruner.push(`${piece}\n`);
    if (flush && pendingText[stream].length > 0) {
      pruner.push(`${pendingText[stream]}\n`);
      pendingText[stream] = "";
    }
  };
  const record = (stream: StreamName, chunk: Buffer, decoder?: StringDecoder): Promise<void> => {
    return schedule(async () => {
      const offset = offsets[stream];
      offsets[stream] += chunk.byteLength;
      rawBytes += chunk.byteLength;
      if (stream === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      await writer.write(chunk);
      await (stream === "stdout" ? stdoutWriter : stderrWriter).write(chunk);
      await eventWriter.write(
        `${JSON.stringify({ sequence, stream, offset, length: chunk.byteLength, observedAtNs: process.hrtime.bigint().toString() })}\n`
      );
      sequence += 1;
      pushDecoded(stream, decoder ? decoder.write(chunk) : chunk.toString("utf8"));
    });
  };
  const pump = async (stream: Readable | null, name: StreamName, decoder: StringDecoder): Promise<void> => {
    if (stream) {
      for await (const chunk of stream) {
        await record(name, Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)), decoder);
      }
    }
    await schedule(() => pushDecoded(name, decoder.end(), true));
  };

  const child = spawn(options.command, options.args, {
    cwd: options.root,
    env: process.env,
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });

  let spawnError: Error | undefined;
  const exitPromise = new Promise<number>((resolve) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => resolve(code ?? (termination.timedOut ? 124 : 127)));
  });

  let timer: NodeJS.Timeout | undefined;
  let terminationTask: Promise<void> | undefined;
  const timeoutPromise =
    options.timeoutMs === undefined
      ? new Promise<number>(() => undefined)
      : new Promise<number>((resolve) => {
          timer = setTimeout(() => {
            terminationTask = (async () => {
              termination.timedOut = true;
              const graceMs = options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS;
              await signalProcessTree(child, false, graceMs);
              if (!(await waitForClose(child, graceMs))) {
                termination.forced = true;
                await signalProcessTree(child, true, graceMs);
              }
              if (!(await waitForClose(child, graceMs))) {
                termination.failed = true;
                child.stdout?.destroy();
                child.stderr?.destroy();
                child.kill("SIGKILL");
              }
            })();
            void terminationTask
              .catch(() => {
                termination.failed = true;
                child.stdout?.destroy();
                child.stderr?.destroy();
              })
              .finally(() => resolve(124));
          }, options.timeoutMs);
          timer.unref();
        });

  let exitCode: number;
  try {
    const pumps = Promise.all([pump(child.stdout, "stdout", stdoutDecoder), pump(child.stderr, "stderr", stderrDecoder)]);
    exitCode = await Promise.race([exitPromise, timeoutPromise]);
    if (terminationTask) await terminationTask.catch(() => undefined);
    await pumps;
    await writeQueue;
    if (termination.timedOut) exitCode = 124;
    if (spawnError) await record("stderr", Buffer.from(`error: failed to start ${basename(options.command)}: ${spawnError.message}\n`));
    await writeQueue;
  } catch (error) {
    await signalProcessTree(child, true).catch(() => undefined);
    await closeWriters(writers).catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  await closeWriters(writers);

  const compacted = pruner.finish();
  const recovery = `Full output: terseforge output ${id}`;
  const visibleOutput = compacted.text.length > 0 ? `${compacted.text}\n${recovery}` : recovery;
  const gateStatus: RecordedGateStatus | undefined =
    options.kind === "gate" ? (termination.timedOut ? "timed_out" : exitCode === 0 ? "passed" : "failed") : undefined;
  const metric: RunMetric = {
    schemaVersion: 1,
    id,
    kind: options.kind,
    preset: options.preset,
    command: options.command,
    exitCode,
    startedAt,
    durationMs: Date.now() - started,
    rawBytes,
    rawLines: compacted.rawLines,
    visibleBytes: Buffer.byteLength(visibleOutput),
    visibleLines: compacted.visibleLines + 1,
    omittedLines: compacted.omittedLines,
    estimatedInputTokens: Math.ceil(rawBytes / 4),
    estimatedVisibleTokens: Math.ceil(Buffer.byteLength(visibleOutput) / 4),
    timedOut: termination.timedOut,
    stdoutBytes,
    stderrBytes,
    ...(termination.forced ? { forcedTermination: true } : {}),
    ...(termination.failed ? { terminationFailed: true } : {}),
    ...(options.checkId ? { checkId: options.checkId } : {}),
    ...(options.checkGateIndex !== undefined ? { checkGateIndex: options.checkGateIndex } : {}),
    ...(options.checkGateCount !== undefined ? { checkGateCount: options.checkGateCount } : {}),
    ...(options.checkCompleted ? { checkCompleted: true } : {}),
    ...(options.gateName ? { gateName: options.gateName } : {}),
    ...(options.gateRequired !== undefined ? { gateRequired: options.gateRequired } : {}),
    ...(gateStatus ? { gateStatus } : {})
  };
  await appendMetric(options.root, metric);

  return { id, exitCode, visibleOutput, artifactPath: writer.path, metric };
}
