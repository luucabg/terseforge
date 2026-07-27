# Benchmarks

The executable v0.2 benchmark is implemented in `src/benchmark.ts` and invoked with:

```bash
npm run build
node dist/cli.js bench --json
```

It deterministically generates five real-shaped fixtures for generic output, TypeScript, ESLint, Vitest, and Jest. It checks complete known diagnostics and nearby multiline context, then verifies byte-for-byte stored-artifact recovery for all three presets. Runtime reports live under `.terseforge/` and are intentionally not committed because they contain timestamps and random artifact identifiers.

`baseline-v0.2.json` records the current deterministic aggregate and is checked by the automated test suite. `baseline-v0.1.json` is retained for historical comparison. Both are component baselines, not total-token or code-quality claims.

See `docs/benchmarking.md` for scope and the future end-to-end A/B protocol.
