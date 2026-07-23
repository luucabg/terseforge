# Benchmarks

The executable v0.1 benchmark is implemented in `src/benchmark.ts` and invoked with:

```bash
npm run build
node dist/cli.js bench --json
```

It deterministically generates `synthetic-typescript-test-log-v1`, checks diagnostic and nearby multiline-context retention, and verifies byte-for-byte stored-artifact recovery for all three presets. Runtime reports live under `.terseforge/` and are intentionally not committed because they contain timestamps and random artifact identifiers.

`baseline-v0.1.json` records the expected deterministic values and is checked by the automated test suite. It is a component baseline, not a marketing claim.

See `docs/benchmarking.md` for scope and the future end-to-end A/B protocol.
