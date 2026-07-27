# Benchmarking

TerseForge separates a deterministic component benchmark from a future end-to-end agent benchmark.

## Included v0.2 benchmark

Run:

```bash
npm ci
npm run build
node dist/cli.js bench --json
```

The command generates a deterministic five-fixture corpus shaped like generic command output, TypeScript, ESLint, Vitest, and Jest. Every fixture mixes routine output with complete known diagnostics. For `safe`, `lean`, and `ultra`, it records:

- raw bytes;
- visible bytes;
- visible-byte reduction;
- whether all known diagnostic fragments remain visible;
- whether every stored artifact is byte-for-byte identical to its fixture.

Reports are written to `.terseforge/benchmarks/`. Raw fixture copies are written to `.terseforge/artifacts/` so recovery is exercised, not assumed.

The committed v0.2 aggregate baseline contains 38,407 raw bytes. It reports 54.29% visible-byte reduction for `safe`, 76.48% for `lean`, and 86.10% for `ultra`, with diagnostics retained and exact artifact recovery in every condition.

This benchmark is deterministic except for timestamps and artifact IDs. It does not call an LLM and does not claim end-to-end token, cost, or code-quality savings. The older v0.1 single-fixture baseline remains in the repository for historical comparison.

## Release acceptance

The component benchmark fails release acceptance if any preset loses a known diagnostic or raw recovery is not exact. A high reduction percentage alone is not a pass.

## Future end-to-end A/B protocol

Before claiming an effect on agent cost, compare:

```text
baseline vs safe vs lean vs ultra
```

Use at least 12 deterministic tasks and three repetitions per condition during development, five for a release. Hold constant:

- model and version;
- reasoning effort;
- repository commit;
- task prompt;
- time and call budgets;
- operating environment;
- starting workspace state.

Randomize condition order and isolate each run. Measure provider-reported values separately from estimates:

- task success and quality-gate success;
- input, output, cached, and total tokens;
- total cost and wall time;
- model and tool calls;
- unique files and lines read;
- raw and visible tool bytes;
- output recovery requests;
- unintended file changes.

Primary decision metrics:

```text
cost_per_success = total cost / successful tasks
tokens_per_success = total tokens / successful tasks
```

Do not accept `k=1`, estimated-only provider tokens, changing models between conditions, or claims based solely on visible output.
