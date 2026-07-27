import type { Preset } from "./config.js";
import { classifyDiagnostic, type PruningAdapter } from "./pruning-adapters.js";

export interface PruneResult {
  adapter: PruningAdapter;
  text: string;
  rawLines: number;
  visibleLines: number;
  omittedLines: number;
  visibleBytes: number;
}

interface IndexedLine {
  index: number;
  text: string;
}

const POLICIES: Record<Preset, { head: number; tail: number; deduplicateDiagnostics: boolean }> = {
  safe: { head: 60, tail: 60, deduplicateDiagnostics: false },
  lean: { head: 25, tail: 25, deduplicateDiagnostics: true },
  ultra: { head: 10, tail: 10, deduplicateDiagnostics: true }
};

const MAX_DIAGNOSTIC_CONTEXT_BEFORE = 4;

export interface PruneOptions {
  adapter?: PruningAdapter;
}

export class StreamingPruner {
  readonly #policy: (typeof POLICIES)[Preset];
  readonly #adapter: PruningAdapter;
  readonly #head: IndexedLine[] = [];
  readonly #tail: IndexedLine[] = [];
  readonly #diagnostics: IndexedLine[] = [];
  readonly #diagnosticCounts = new Map<string, { first: IndexedLine; count: number }>();
  readonly #recent: IndexedLine[] = [];
  #pending = "";
  #lineCount = 0;
  #diagnosticLinesRemaining = 0;

  constructor(preset: Preset, options: PruneOptions = {}) {
    this.#policy = POLICIES[preset];
    this.#adapter = options.adapter ?? "generic";
  }

  push(chunk: string): void {
    const pieces = `${this.#pending}${chunk}`.split("\n");
    this.#pending = pieces.pop() ?? "";
    for (const piece of pieces) {
      this.#addLine(piece.endsWith("\r") ? piece.slice(0, -1) : piece);
    }
  }

  finish(): PruneResult {
    if (this.#pending.length > 0) {
      this.#addLine(this.#pending.endsWith("\r") ? this.#pending.slice(0, -1) : this.#pending);
      this.#pending = "";
    }

    const selected = new Map<number, string>();
    for (const entry of [...this.#head, ...this.#tail, ...this.#diagnostics]) {
      selected.set(entry.index, entry.text);
    }
    for (const { first, count } of this.#diagnosticCounts.values()) {
      selected.set(first.index, count > 1 ? `${first.text} [repeated ${count}x]` : first.text);
    }

    const ordered = [...selected.entries()].sort(([left], [right]) => left - right);
    const visible: string[] = [];
    let previous = -1;
    for (const [index, text] of ordered) {
      const gap = index - previous - 1;
      if (gap > 0) visible.push(`… ${gap} lines omitted …`);
      visible.push(text);
      previous = index;
    }
    const trailing = this.#lineCount - previous - 1;
    if (trailing > 0) visible.push(`… ${trailing} lines omitted …`);

    const text = visible.join("\n");
    return {
      adapter: this.#adapter,
      text,
      rawLines: this.#lineCount,
      visibleLines: visible.length,
      omittedLines: Math.max(0, this.#lineCount - selected.size),
      visibleBytes: Buffer.byteLength(text)
    };
  }

  #addLine(text: string): void {
    const entry = { index: this.#lineCount, text };
    this.#lineCount += 1;
    if (this.#head.length < this.#policy.head) this.#head.push(entry);
    this.#tail.push(entry);
    if (this.#tail.length > this.#policy.tail) this.#tail.shift();

    const classification = classifyDiagnostic(text, this.#adapter);
    if (classification.diagnostic) {
      const recent = this.#recent.slice(-classification.contextBefore);
      if (!this.#policy.deduplicateDiagnostics) {
        this.#diagnostics.push(...recent, entry);
        this.#diagnosticLinesRemaining = Math.max(this.#diagnosticLinesRemaining, classification.contextAfter);
      } else {
        const existing = this.#diagnosticCounts.get(classification.key);
        if (existing) {
          existing.count += 1;
          this.#diagnosticLinesRemaining = Math.max(this.#diagnosticLinesRemaining, classification.contextAfter);
        } else {
          this.#diagnostics.push(...recent);
          this.#diagnosticCounts.set(classification.key, { first: entry, count: 1 });
          this.#diagnosticLinesRemaining = Math.max(this.#diagnosticLinesRemaining, classification.contextAfter);
        }
      }
    } else if (this.#diagnosticLinesRemaining > 0) {
      this.#diagnostics.push(entry);
      this.#diagnosticLinesRemaining -= 1;
    }

    this.#recent.push(entry);
    if (this.#recent.length > MAX_DIAGNOSTIC_CONTEXT_BEFORE) this.#recent.shift();
  }
}

export function pruneText(text: string, preset: Preset, options: PruneOptions = {}): PruneResult {
  const pruner = new StreamingPruner(preset, options);
  pruner.push(text);
  return pruner.finish();
}
