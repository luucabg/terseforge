export function selectArtifactLines(raw: string, range?: string): string {
  if (!range) return raw;
  const match = /^(\d+):(\d+)$/u.exec(range);
  if (!match) throw new Error("Invalid line range. Use START:END with 1-based inclusive line numbers.");
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
    throw new Error("Invalid line range. START must be at least 1 and END must be greater than or equal to START.");
  }
  const lines = raw.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines.slice(start - 1, end).join("\n");
}
