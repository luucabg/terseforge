---
name: terseforge
description: Activate, configure, inspect, or use TerseForge in a coding project. Use when someone asks to "activate TerseForge in this project," use a safe, lean, or ultra preset, change the TerseForge mode, check whether it is active, or make a coding-agent workflow more token-efficient without weakening verification. Match equivalent requests in any language.
---

# TerseForge

Use the local TerseForge CLI. Keep code quality and verification above token reduction.

## Activate in the current project

1. Run `terseforge --version`. If unavailable, explain that the CLI must be installed; do not install remote software silently.
2. Identify the current host as `codex`, `claude`, or `gemini`.
3. If `terseforge.config.json` is absent, run `terseforge init --preset <mode>`, using an explicitly requested mode or `safe` by default.
4. If configuration exists, preserve its current mode unless the user explicitly requests another. Change an explicit mode with `terseforge mode <mode>`.
5. Run `terseforge skill install --agent <host> --scope project` so future sessions in this repository can discover the skill.
6. Run `terseforge doctor`. Report the mode, installed skill path, and diagnostic result briefly.

Never use `init --force` merely to change modes. Never overwrite an existing foreign skill or instruction file.

## Work with TerseForge

- Use `terseforge map` and targeted `terseforge context` before broad file reads.
- Use `terseforge exec -- <command> [args...]` for noisy commands.
- Retrieve omitted content with `terseforge output <run-id>` whenever more evidence is needed.
- Preserve code, diffs, commands, paths, diagnostics, and security findings exactly.
- Run `terseforge check` before claiming completion. Required failures block verification.

`safe`, `lean`, and `ultra` control visible context and logs, not code length or reasoning quality. Prefer `safe` for risky or unfamiliar work.

## Inspect or stop

- For status, run `terseforge doctor` and `terseforge skill status --agent <host> --scope project`.
- To stop using TerseForge for the current task, stop invoking its commands and say that project files remain unchanged.
- Before removing persistent configuration or skill files, list the exact paths and obtain confirmation; removal is not automated.
