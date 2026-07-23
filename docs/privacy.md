# Privacy model

TerseForge v0.1 is local by construction.

## Data written

All runtime data is kept under the target repository's `.terseforge/` directory:

```text
.terseforge/
├── artifacts/       stdout, stderr, merged output, and sequenced events
├── benchmarks/      local component benchmark reports
├── integrations/    copied reference assets
├── handoff.md       compact Git-aware handoff
└── runs.jsonl       command metadata and size estimates
```

Metrics include the executable name, exit code, timestamps, duration, byte/line counts, token estimates, preset, timeout status, and gate/check identifiers. Arguments are not recorded because they may contain secrets. Event records contain stream names, byte offsets, chunk lengths, sequence numbers, and local monotonic timestamps, but not duplicate output content.

## Data not sent

TerseForge has no server, analytics SDK, telemetry endpoint, account system, provider API call, or automatic upload. The `telemetry` configuration field only accepts `false`.

## Sensitive output

Commands can print credentials or private source data. Output artifacts are therefore sensitive even though they stay local. TerseForge requests owner-only permissions when creating artifacts; filesystem and operating-system policy ultimately control access.

Keep `.terseforge/` out of version control. Review any handoff before sharing it. Delete local state manually when retention is no longer needed; automatic retention cleanup is intentionally not implemented in v0.1.
