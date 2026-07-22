# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Classified Gemini CLI as native-limited for Agent Skill discovery while continuing to make no hook-interception claim.
- Redesigned the repository landing page around a clearer quick start, workflow, compatibility contract, reproducible evidence, and safety guarantees.
- Expanded package metadata for more accurate discovery across AI coding-agent and developer-tool searches.
- Optimized the hero artwork from 1.76 MB to approximately 125 KB while preserving its 2:1 presentation.

### Added

- Portable TerseForge Agent Skill with natural-language activation for Codex, Claude Code, and Gemini CLI.
- Safe, idempotent `skill install` and `skill status` commands for user and project discovery paths.
- `mode` command for changing presets without resetting other project configuration.
- Machine-readable `llms.txt` summary with capabilities, compatibility levels, safety guarantees, benchmark scope, and explicit non-claims.
- Brand and messaging guidelines for consistent visuals, terminology, and evidence-based claims.

## [0.1.0] - 2026-07-22

### Added

- Single-package TypeScript/Node.js 22+ CLI with `init`, `doctor`, `exec`, `output`, `map`, `context`, `check`, `handoff`, `stats`, and `bench`.
- Conservative `safe` default plus `lean` and `ultra` presets.
- Diagnostic-preserving output pruning with byte-for-byte local recovery.
- Local `.terseforge` artifacts, JSONL metrics, benchmark reports, integration assets, and handoffs.
- Progressive TypeScript/JavaScript mapping and lexical context selection.
- Configurable, required/optional quality gates.
- Honest Claude Code, Codex, Gemini CLI, AGENTS.md, Cursor, Windsurf, and Cline assets.
- Deterministic component benchmark, cross-platform CI, tests, coverage enforcement, and project documentation.

[Unreleased]: https://github.com/luucabg/terseforge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luucabg/terseforge/releases/tag/v0.1.0
