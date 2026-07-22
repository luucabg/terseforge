---
name: terseforge
description: Use the local TerseForge CLI to reduce irrelevant coding-agent context and noisy tool output while preserving raw logs and enforcing configured quality gates.
---

# TerseForge

Use this skill when a repository contains `terseforge.config.json`.

1. Read the configuration and default to `safe` if the mode is unclear.
2. Use `terseforge map` and targeted `terseforge context` before broad file reads.
3. Use `terseforge exec -- <command> [args...]` for noisy commands.
4. Retrieve exact omitted content with `terseforge output <run-id>` when needed.
5. Preserve code, diffs, commands, paths, diagnostics, and security findings exactly.
6. Run `terseforge check` before claiming completion. Required failures block verification.

This skill affects context, logs, and communication. It must not reduce reasoning quality or code verification.
