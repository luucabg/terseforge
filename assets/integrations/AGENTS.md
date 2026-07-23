<!-- terseforge:managed-instructions -->
# TerseForge workflow (Codex / AGENTS.md agents)

TerseForge optimizes context, tool logs, and visible chatter. It must not reduce code quality, omit relevant diagnostics, or replace verification.

- Start with the `safe` preset unless this repository explicitly selects another preset.
- Prefer targeted search, repository maps, symbols, and numbered snippets before reading complete files.
- Run noisy commands through `terseforge exec -- <command> [args...]` when available.
- Recover stored output bytes with `terseforge output <run-id>`; use `--stream stdout|stderr` for an exact source stream and `--lines START:END` for a range.
- Keep code, diffs, commands, paths, API names, errors, warnings, and security findings exact.
- Edit diff-first and do not reprint unchanged files.
- Run `terseforge check` before claiming completion. A required failing gate blocks verification.
- Communicate decisions, blockers, changed files, and verification results briefly. Do not suppress uncertainty.

Integration level: native instruction-file loading plus an explicit local CLI. TerseForge does not automatically intercept every Codex tool call.
