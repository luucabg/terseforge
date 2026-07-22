import { basename } from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import spawn from "cross-spawn";
import type { Preset } from "./config.js";
import { StreamingPruner } from "./pruning.js";
import { appendMetric, createArtifactWriter, createRunId, type RunKind, type RunMetric } from "./storage.js";

export interface RunProcessOptions {
  root: string;
  command: string;
  args: string[];
  preset: Preset;
  kind: RunKind;
  timeoutMs?: number;
}

export interface RunProcessResult {
  id: string;
  exitCode: number;
  visibleOutput: string;
  artifactPath: string;
  metric: RunMetric;
}

export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const id = createRunId(options.kind);
  const writer = await createArtifactWriter(options.root, id);
  const pruner = new StreamingPruner(options.preset);
  let rawBytes = 0;
  let timedOut = false;
  const stdoutDecoder = new StringDecoder("utf8");
  const stderrDecoder = new StringDecoder("utf8");
  let writeQueue = Promise.resolve();

  const schedule = (action: () => Promise<void> | void): Promise<void> => {
    const task = writeQueue.then(action);
    writeQueue = task.catch(() => undefined);
    return task;
  };
  const record = (chunk: Buffer, decoder?: StringDecoder): Promise<void> => {
    return schedule(async () => {
      rawBytes += chunk.byteLength;
      await writer.write(chunk);
      pruner.push(decoder ? decoder.write(chunk) : chunk.toString("utf8"));
    });
  };
  const pump = async (stream: Readable | null, decoder: StringDecoder): Promise<void> => {
    if (stream) {
      for await (const chunk of stream) {
        await record(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)), decoder);
      }
    }
    await schedule(() => pruner.push(decoder.end()));
  };

  const child = spawn(options.command, options.args, {
    cwd: options.root,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let timer: NodeJS.Timeout | undefined;
  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
    timer.unref();
  }

  let spawnError: Error | undefined;
  const exitPromise = new Promise<number>((resolve) => {
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code) => resolve(code ?? (timedOut ? 124 : 127)));
  });
  let exitCode: number;
  try {
    [exitCode] = await Promise.all([exitPromise, pump(child.stdout, stdoutDecoder), pump(child.stderr, stderrDecoder)]);
    if (spawnError) {
      await record(Buffer.from(`error: failed to start ${basename(options.command)}: ${spawnError.message}\n`));
    }
  } catch (error) {
    child.kill("SIGTERM");
    await writer.close().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  await writer.close();

  const compacted = pruner.finish();
  const recovery = `Full output: terseforge output ${id}`;
  const visibleOutput = compacted.text.length > 0 ? `${compacted.text}\n${recovery}` : recovery;
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
    timedOut
  };
  await appendMetric(options.root, metric);

  return { id, exitCode, visibleOutput, artifactPath: writer.path, metric };
}
