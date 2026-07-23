<!-- terseforge:managed-instructions -->
# TerseForge rule

Default to the `safe` preset. Optimize context, noisy tool logs, and visible narration only. Preserve code, diffs, commands, paths, errors, warnings, and security findings. Use `terseforge exec -- ...`, retrieve stored output with `terseforge output <run-id>`, and run `terseforge check` before claiming completion. Required failures block verification.

Compatibility is instructions-only; automatic tool interception is not claimed.
