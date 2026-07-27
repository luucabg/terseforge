# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-07-27

### Added

- Persistent incremental TypeScript and JavaScript context index with safe cache recovery and selective reparsing.
- Dependency discovery for reexports, dynamic imports, CommonJS `require` calls, and root `tsconfig` path aliases.
- Conservative pruning adapters for TypeScript, ESLint, Vitest, and Jest, including multiline assertion and diagnostic context.
- Explicit `clean` command with dry-run support and bounded retention cleanup for local artifacts, benchmark reports, and metrics.
- Automatic, idempotent `/.terseforge/` protection in `.gitignore` plus a `doctor` warning when local state is not ignored.
- Five-fixture component benchmark corpus covering generic, TypeScript, ESLint, Vitest, and Jest output.

### Changed

- Made context selection reuse unchanged structural metadata, remove deleted files, include new untracked files, and read source only for ranked snippet candidates.
- Recorded the detected pruning adapter in local run metrics while preserving older metric records.
- Labeled optional `doctor` findings as warnings rather than failures.
- Updated the benchmark evidence and documentation without treating component byte reduction as total-token savings.
- Bumped the package and CLI to Node.js release `0.2.0` while preserving the schema-v1 configuration format and public command behavior.

### Security

- Rejected linked `.terseforge` state roots and linked state directories, restricted cleanup to owned paths, and preserved malformed historical metric lines instead of deleting uncertain data.
- Kept context caches local, atomically written, owner-restricted where supported, and free of complete source-file contents.

## [0.1.2] - 2026-07-23

### Added

- Published the public `terseforge` package on npm.
- Added a token-free GitHub trusted-publishing workflow with automatic npm provenance.
- Added a maintainer publishing guide with tag and package-version validation.

### Changed

- Made npm the primary installation path in the README, Agent Skill guide, and machine-readable project summary.

## [0.1.1] - 2026-07-23

### Changed

- Made `output` byte-preserving for full artifacts and line ranges, including original CRLF and missing final newlines.
- Split process capture into exact stdout/stderr artifacts, a merged best-effort view, and a sequenced event log.
- Kept partial stdout and stderr lines separate in compacted diagnostic views.
- Added bounded two-phase process-tree termination with forced escalation after the timeout grace period.
- Made `init` detect real package scripts and made `check` fail closed for missing or empty gate configuration.
- Grouped gate metrics by completed check ID so handoffs no longer mix historical verification or lose gate names and required status.
- Refused stale verification in handoffs when the newest check is incomplete.
- Made `doctor` validate TerseForge content or skill metadata rather than generic instruction-file existence.
- Included untracked non-ignored TS/JS files, tolerated deleted tracked files, preserved matching lines under tight budgets, added multiple snippets and one-hop import expansion, and bounded human-readable maps.
- Retained nearby multiline diagnostic context such as stack frames, source excerpts, and assertion details.
- Updated the deterministic component baseline to reflect the safer diagnostic-context policy.
- Made English the primary language for public documentation and activation examples, with equivalent requests still supported in other languages.
- Reworked public copy for a clearer maintainer voice and replaced em dashes with plain punctuation.
- Corrected stale command-count and Gemini compatibility language in supporting documentation.
- Classified Gemini CLI as native-limited for Agent Skill discovery while continuing to make no hook-interception claim.
- Redesigned the repository landing page around a clearer quick start, workflow, compatibility contract, reproducible evidence, and safety guarantees.
- Expanded package metadata for more accurate discovery across AI coding-agent and developer-tool searches.
- Optimized the hero artwork from 1.76 MB to approximately 125 KB while preserving its 2:1 presentation.

### Added

- Copyable agent-assisted installation prompt with the canonical repository, safe boundaries, and verification commands.
- Portable TerseForge Agent Skill with natural-language activation for Codex, Claude Code, and Gemini CLI.
- Safe, idempotent `skill install` and `skill status` commands for user and project discovery paths.
- `mode` command for changing presets without resetting other project configuration.
- Machine-readable `llms.txt` summary with capabilities, compatibility levels, safety guarantees, benchmark scope, and explicit non-claims.
- Brand and messaging guidelines for consistent visuals, terminology, and evidence-based claims.

## [0.1.0] - 2026-07-22

### Added

- Single-package TypeScript/Node.js 22+ CLI with `init`, `doctor`, `exec`, `output`, `map`, `context`, `check`, `handoff`, `stats`, and `bench`.
- Conservative `safe` default plus `lean` and `ultra` presets.
- Diagnostic-preserving output pruning with byte-preserving local artifact storage.
- Local `.terseforge` artifacts, JSONL metrics, benchmark reports, integration assets, and handoffs.
- Progressive TypeScript/JavaScript mapping and lexical context selection.
- Configurable, required/optional quality gates.
- Claude Code, Codex, Gemini CLI, AGENTS.md, Cursor, Windsurf, and Cline assets with explicit compatibility limits.
- Deterministic component benchmark, cross-platform CI, tests, coverage enforcement, and project documentation.

[Unreleased]: https://github.com/luucabg/terseforge/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/luucabg/terseforge/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/luucabg/terseforge/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/luucabg/terseforge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/luucabg/terseforge/releases/tag/v0.1.0
