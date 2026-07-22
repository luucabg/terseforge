# Configuration

`terseforge.config.json` uses schema version 1.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Enables explicit future migrations. |
| `preset` | `safe`, `lean`, `ultra` | Visible output policy. `safe` is the default. |
| `telemetry` | `false` | Remote telemetry is intentionally unavailable in v0.1. |
| `context.budgetTokens` | 100–100000 | Estimated maximum for selected snippets. |
| `context.maxFileBytes` | 1024–10000000 | Per-file parsing limit. |
| `output.artifactRetentionDays` | 1–365 | Retention intent; automatic deletion is not implemented in v0.1. |
| `qualityGates` | array | Explicit executable, arguments, timeout, and required/optional status. |

## Quality gates

Each gate has:

```json
{
  "name": "test",
  "command": "npm",
  "args": ["test"],
  "required": true,
  "timeoutMs": 300000
}
```

The executable is not a shell string. Put every argument in `args`. TerseForge rejects shell metacharacters in `command`, runs with a cross-platform argument-safe process launcher, and never interprets `args` as a concatenated shell expression.

Required non-zero results make `terseforge check` exit non-zero. Optional failures are still shown and stored.
