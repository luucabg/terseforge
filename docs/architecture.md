# Architecture

TerseForge v0.1 is one ESM npm package with internal module boundaries. A monorepo would add versioning and release overhead without a demonstrated need.

## Modules

| Module | Responsibility |
| --- | --- |
| `config` | Validate schema v1, presets, context limits, and argument-array gates. |
| `project` | Initialize local state, copy integration assets without overwriting user files, and diagnose capabilities. |
| `skill` | Resolve, inspect, and install native Agent Skill discovery paths without overwriting foreign files. |
| `runner` | Execute argument arrays, capture each output stream, enforce bounded process-tree termination, compact the visible view, and record metrics. |
| `pruning` | Retain configurable head/tail context, diagnostics, and nearby multiline context; count exact duplicate diagnostics in lean/ultra. |
| `storage` | Keep per-stream artifacts, merged output, event logs, backward-compatible JSONL metrics, benchmark reports, integration copies, and handoffs. |
| `context` | Discover tracked and untracked sources, parse each file once, rank paths/imports/declarations/content, expand one import hop, and emit bounded snippets. |
| `gates` | Run explicit configured checks sequentially and distinguish passed, failed, timed-out, and unconfigured results. |
| `benchmark` | Exercise pruning and byte-for-byte recovery on a deterministic fixture. |
| `workflows` | Aggregate metrics and create Git-aware handoffs. |
| `cli-program` | Wire the public commands to the modules above. |

## Command-output flow

```text
executable + argument array
        |
        v
cross-platform spawn (no user-controlled shell expression)
        |
        +----> stdout bytes ------------> .terseforge/artifacts/<id>.stdout.log
        +----> stderr bytes ------------> .terseforge/artifacts/<id>.stderr.log
        +----> observed merged bytes ---> .terseforge/artifacts/<id>.log
        +----> sequenced chunk events --> .terseforge/artifacts/<id>.events.jsonl
        |
        +----> streaming line classifier
                    |
                    +----> routine head/tail
                    +----> protected errors/warnings/failures
                    +----> omission counts
                              |
                              v
                    compact visible output + recovery command
```

Artifacts are opened with exclusive creation, so an identifier collision cannot overwrite an earlier log. Output IDs accept only ASCII letters, digits, underscores, and hyphens. Each source stream is exact. The merged artifact follows the order in which Node observes chunks from independent pipes; it cannot guarantee terminal interleaving.

Timeouts use two phases. TerseForge first requests process-tree termination, waits a configurable grace period, and then forces termination. A final bound destroys local pipes if the operating system does not report closure.

## Context flow

```text
git tracked + untracked, non-ignored files (fallback: glob + .gitignore)
        -> supported TS/JS files
        -> size limit
        -> imports and top-level symbols
        -> lexical path/import/symbol/content score
        -> one-hop import expansion
        -> one or more match-centered numbered snippets
        -> estimated token budget
```

Token counts are estimates. v0.1 divides UTF-8 bytes by four and rounds up. A local CLI cannot access provider-reported token counts, so TerseForge keeps estimated and reported values separate.

Context files are parsed once per command, rather than twice as in the initial implementation. v0.1 does not yet persist a repository index between commands. On a massive monorepo, use `--cwd` to scope TerseForge to the relevant workspace until incremental indexing is implemented and benchmarked.

## Failure policy

- Output optimization is subordinate to recovery. Every process launch creates separate stdout/stderr artifacts, a merged view, and sequenced events.
- Required quality gates fail closed. Missing package scripts and an empty gate configuration make `check` exit non-zero.
- Handoffs use only the latest complete check identifier. Ambiguous legacy gate metrics are not presented as current verification.
- Optional integration files never overwrite existing user-owned files.
- Unsupported or unavailable agent hooks are described as limitations, not silently emulated.
- A missing Git executable falls back to file discovery; a missing or invalid configuration is an explicit error.

## Public API

The package exports core configuration, mapping, selection, pruning, execution, storage retrieval, gate, benchmark, and summary functions. The API is experimental until v1.0; configuration includes a schema version so future migrations can be explicit.
