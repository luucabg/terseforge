# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/luucabg/terseforge/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/luucabg/terseforge/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/luucabg/terseforge/releases/tag/v0.1.0
