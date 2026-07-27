# Configuration

`terseforge.config.json` uses schema version 1.

## Fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | `1` | Enables explicit future migrations. |
| `preset` | `safe`, `lean`, `ultra` | Visible output policy. `safe` is the default. |
| `telemetry` | `false` | Remote telemetry is intentionally unavailable. |
| `context.budgetTokens` | 100–100000 | Estimated maximum for selected snippets. |
| `context.maxFileBytes` | 1024–10000000 | Per-file parsing limit. |
| `output.artifactRetentionDays` | 1–365 | Default age threshold used by the explicit `clean` command. |
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

`terseforge init` reads the current `package.json` and configures only existing `typecheck`, `lint`, `test`, and `build` scripts. It does not generate `--if-present` gates. A known package-manager gate whose script is missing is recorded as `not_configured`, never `passed`. An empty `qualityGates` array also makes `terseforge check` exit non-zero.

Gate metrics retain the original gate name, required/optional condition, status, and check identifier. Older schema-v1 JSONL records remain readable, but handoffs ignore legacy records that cannot be assigned safely to one complete check.

## Local retention

`terseforge clean` applies `output.artifactRetentionDays` to local artifacts, benchmark reports, and metrics. Nothing is deleted on a timer or in the background.

```bash
terseforge clean --dry-run
terseforge clean
terseforge clean --older-than 14
```

Cleanup stays within `.terseforge/artifacts/`, `.terseforge/benchmarks/`, and `.terseforge/runs.jsonl`. It does not follow directory symlinks. Invalid historical metric lines are preserved rather than discarded.

`terseforge init` adds an idempotent `/.terseforge/` entry to the root `.gitignore`. `doctor` reports a warning when the local state rule is absent, but that optional warning does not hide otherwise valid project checks.
