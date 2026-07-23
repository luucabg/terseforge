export function selectArtifactLines(raw: string, range?: string): string {
  if (!range) return raw;
  const { start, end } = parseLineRange(range);
  const spans: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "\n") continue;
    spans.push({ start: lineStart, end: index + 1 });
    lineStart = index + 1;
  }
  if (lineStart < raw.length) spans.push({ start: lineStart, end: raw.length });
  const selected = spans.slice(start - 1, end);
  if (selected.length === 0) return "";
  return raw.slice(selected[0]?.start ?? 0, selected.at(-1)?.end ?? 0);
}

export function selectArtifactBytes(raw: Uint8Array, range?: string): Buffer {
  const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (!range) return buffer;
  const { start, end } = parseLineRange(range);
  const spans: Array<{ start: number; end: number }> = [];
  let lineStart = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue;
    spans.push({ start: lineStart, end: index + 1 });
    lineStart = index + 1;
  }
  if (lineStart < buffer.length) spans.push({ start: lineStart, end: buffer.length });
  const selected = spans.slice(start - 1, end);
  if (selected.length === 0) return Buffer.alloc(0);
  return buffer.subarray(selected[0]?.start ?? 0, selected.at(-1)?.end ?? 0);
}

export function parseLineRange(range: string): { start: number; end: number } {
  const match = /^(\d+):(\d+)$/u.exec(range);
  if (!match) throw new Error("Invalid line range. Use START:END with 1-based inclusive line numbers.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
    throw new Error("Invalid line range. START must be at least 1 and END must be greater than or equal to START.");
  }
  return { start, end };
}
