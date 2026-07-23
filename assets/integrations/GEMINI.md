<!-- terseforge:managed-instructions -->
# TerseForge workflow for Gemini CLI

Use TerseForge conservatively to reduce tool-log and context noise without changing code quality.

- `safe` is the default preset.
- Select context progressively with `terseforge map` and `terseforge context`.
- Wrap verbose commands with `terseforge exec -- ...` and recover stored output using `terseforge output <run-id>`.
- Do not alter or hide code, diffs, paths, commands, errors, warnings, or security findings.
- Quality gates are mandatory: run `terseforge check` and report every required failure.
- Keep routine narration brief; give additional detail for security, data, and migration risks.

Integration level: native-limited Agent Skill or instruction-file loading plus an explicit local CLI. No Gemini hook interception is claimed in v0.1.
