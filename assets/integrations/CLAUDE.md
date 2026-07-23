<!-- terseforge:managed-instructions -->
# TerseForge workflow for Claude Code

TerseForge reduces irrelevant context, noisy tool output, and visible narration. It never authorizes weaker code or skipped verification.

- Use the repository preset; default to `safe` when uncertain.
- Prefer `terseforge map` and `terseforge context "<task>" --symbol <name>` before broad file reads.
- Use `terseforge exec -- <command> [args...]` for verbose commands.
- If a compact result is insufficient, retrieve stored output with `terseforge output <run-id>` or an exact source stream with `--stream stdout|stderr`.
- Preserve code, patches, paths, commands, errors, warnings, and security findings exactly.
- Run `terseforge check` before declaring success. Never describe failed required gates as verified.
- Keep status text short, but explain risky security, migration, or data-loss decisions.

Integration level: Claude Code instruction/skill asset plus an explicit local CLI. Automatic tool interception is not claimed.
