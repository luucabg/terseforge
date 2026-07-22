# Architecture

TerseForge v0.1 is one ESM npm package with internal module boundaries. A monorepo would add versioning and release overhead without a demonstrated need.

## Modules

| Module | Responsibility |
| --- | --- |
| `config` | Validate schema v1, presets, context limits, and argument-array gates. |
| `project` | Initialize local state, copy integration assets without overwriting user files, and diagnose capabilities. |
| `runner` | Execute argument arrays, stream full output to an artifact, compact the visible view, and record metrics. |
| `pruning` | Retain configurable head/tail context and every diagnostic; count exact duplicate diagnostics in lean/ultra. |
| `storage` | Keep artifacts, JSONL metrics, benchmark reports, integration copies, and handoffs under `.terseforge/`. |
| `context` | Discover supported files, parse TS/JS imports and declarations, rank candidates, and emit bounded numbered snippets. |
| `gates` | Run explicit configured checks sequentially and fail when a required gate fails. |
| `benchmark` | Exercise pruning and byte-for-byte recovery on a deterministic fixture. |
| `workflows` | Aggregate metrics and create Git-aware handoffs. |
| `cli-program` | Wire the ten public commands to the modules above. |

## Command-output flow

```text
executable + argument array
        |
        v
cross-platform spawn (no user-controlled shell expression)
        |
        +----> complete byte stream ----> .terseforge/artifacts/<id>.log
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

The artifact is opened with exclusive creation, so an identifier collision cannot overwrite an earlier log. Output IDs accept only ASCII letters, digits, underscores, and hyphens.

## Context flow

```text
git-tracked files (fallback: glob + .gitignore)
        -> supported TS/JS files
        -> size limit
        -> imports and top-level symbols
        -> lexical path/import/symbol/content score
        -> numbered snippets
        -> estimated token budget
```

The estimate is clearly an estimate: UTF-8 bytes divided by four, rounded up. Provider-reported tokens are not available to a local CLI and are not fabricated.

## Failure policy

- Output optimization is subordinate to raw recovery. Every successful process launch writes a raw artifact, even when nothing is omitted.
- Required quality gates fail closed: `check` exits non-zero.
- Optional integration files never overwrite existing user-owned files.
- Unsupported or unavailable agent hooks are described as limitations, not silently emulated.
- A missing Git executable falls back to file discovery; a missing or invalid configuration is an explicit error.

## Public API

The package exports core configuration, mapping, selection, pruning, execution, storage retrieval, gate, benchmark, and summary functions. The API is experimental until v1.0; configuration includes a schema version so future migrations can be explicit.
