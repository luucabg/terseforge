# TerseForge

**Big code. Small chatter.**

![TerseForge compresses noisy code and terminal output into a clean, structured signal.](assets/brand/terseforge-hero.png)

TerseForge is a local, measurable optimization layer for AI coding-agent workflows. It reduces irrelevant context, noisy command output, and repetitive visible narration while preserving exact raw logs and enforcing configured quality gates.

> [!IMPORTANT]
> TerseForge does not make an agent reason less or accept worse code. Presets affect context selection, tool-log presentation, and communication only. Code, diffs, commands, paths, errors, warnings, and security findings remain protected; required quality gates must pass before work is described as verified.

TerseForge v0.1 is an experimental MVP. It does not use a server, call a model, upload code, or send telemetry.

## What it does

- Runs commands without a user-controlled shell and stores their complete output under `.terseforge/artifacts/`.
- Prints a compact, diagnostic-preserving view with an exact recovery command.
- Builds a compact TypeScript/JavaScript repository map from paths, imports, and top-level symbols.
- Selects progressively ranked, line-numbered context snippets within a configurable budget.
- Runs explicit typecheck, lint, test, and build gates; required failures block success.
- Records local JSONL metrics and generates a deterministic handoff.
- Benchmarks the output-pruning layer without pretending that this proves end-to-end token savings.

## Requirements

- Node.js 22 or newer.
- Git is recommended. Context selection falls back to local file discovery when Git is unavailable.
- Windows, macOS, or Linux.

## Install from source

The package is not published to npm yet.

```bash
git clone https://github.com/luucabg/terseforge.git
cd terseforge
npm ci
npm run build
npm link
```

Then initialize a target repository:

```bash
cd /path/to/your/repository
terseforge init --preset safe --install codex claude
terseforge doctor
```

`init` never overwrites an existing agent instruction file. Generated reference assets live under `.terseforge/integrations/`; root-level instruction files are installed only when named with `--install`.

## Commands

| Command | Purpose |
| --- | --- |
| `terseforge init` | Create local configuration and optional instruction files. |
| `terseforge doctor` | Check Node, Git, configuration, and integration levels. |
| `terseforge exec -- <command> [args...]` | Run without a user-controlled shell, preserve raw output, print a compact view. |
| `terseforge output <run-id> [--lines 20:60]` | Recover exact output or a 1-based inclusive line range. |
| `terseforge map [--json]` | Map TS/JS imports and top-level symbols. |
| `terseforge context "query" [--symbol name] [--budget 1200]` | Select bounded, numbered snippets. |
| `terseforge check` | Run configured quality gates. |
| `terseforge handoff "objective"` | Write `.terseforge/handoff.md`. |
| `terseforge stats [--json]` | Summarize local execution metrics. |
| `terseforge bench [--json]` | Run the deterministic pruning benchmark. |

Visible-byte statistics include the recovery instruction itself. Very short command output can therefore show negative savings; TerseForge reports that overhead instead of clamping it away.

Example:

```bash
terseforge exec -- npm test
# … 412 lines omitted …
# src/auth.ts:22:7 error TS2322: Type mismatch
# Tests: 1 failed, 84 passed
# Full output: terseforge output exec_mabc123_12ab34cd

terseforge output exec_mabc123_12ab34cd --lines 180:240
```

## Presets

`safe` is the default during initial development.

| Preset | Routine head/tail | Duplicate diagnostics | Intended use |
| --- | ---: | --- | --- |
| `safe` | 60 / 60 lines | Preserved | New repositories, risky tasks, debugging. |
| `lean` | 25 / 25 lines | Exact duplicates counted | Daily development after validating the repository. |
| `ultra` | 10 / 10 lines | Exact duplicates counted | Explicitly chosen low-chatter workflows. |

Every preset retains diagnostic content. If nearly every line is an error or warning, output may remain large; correctness wins over compression.

## Configuration

`terseforge.config.json` is local, declarative, and safe to version:

```json
{
  "schemaVersion": 1,
  "preset": "safe",
  "telemetry": false,
  "context": {
    "budgetTokens": 1200,
    "maxFileBytes": 200000
  },
  "output": {
    "artifactRetentionDays": 30
  },
  "qualityGates": [
    {
      "name": "test",
      "command": "npm",
      "args": ["test"],
      "required": true,
      "timeoutMs": 300000
    }
  ]
}
```

Commands and arguments are separate arrays. Shell expressions such as `npm test && deploy` are rejected. TerseForge currently records retention intent but does not delete artifacts automatically in v0.1.

See [configuration](docs/configuration.md) and [architecture](docs/architecture.md).

## Compatibility: exact claims

| Agent | v0.1 level | What exists | What does not |
| --- | --- | --- | --- |
| Claude Code | Native-limited | Native instruction/skill asset and explicit CLI workflow. | No automatic interception of every tool call. |
| Codex | Native-limited | Native `AGENTS.md`/skill loading and explicit CLI workflow. | No automatic replacement of tool results. |
| Gemini CLI | Experimental | `GEMINI.md` asset and explicit CLI workflow. | No stable hook interception. |
| Other `AGENTS.md` agents | Instructions-only | Portable policy file. | No runtime integration. |
| Cursor, Windsurf, Cline | Instructions-only | Rule-file assets. | No guaranteed command routing. |

“Native-limited” means the agent natively loads its instruction or skill format; it does not mean TerseForge transparently controls the agent. See [compatibility details](docs/compatibility.md).

## Benchmark: honest scope

```bash
npm run build
node dist/cli.js bench --json
```

The v0.1 benchmark uses a fixed synthetic TypeScript test log and checks three properties per preset:

1. visible bytes;
2. retention of known diagnostics;
3. byte-for-byte raw recovery.

It does **not** measure total agent input/output tokens, code quality, or task success. No marketing percentage should be inferred from it. The end-to-end A/B protocol is documented in [benchmarking](docs/benchmarking.md).

## Privacy and security

- No server and no remote telemetry.
- No model or provider API calls.
- State stays under `.terseforge/`, which the generated `.gitignore` pattern should exclude.
- Child commands receive argument arrays and are not concatenated into a shell expression.
- Artifact identifiers are allowlisted to prevent path traversal.
- Configuration rejects shell metacharacters in executable fields.

Command output can contain secrets. Raw artifacts are created with owner-only permissions where the operating system supports them; treat `.terseforge/` as sensitive local data. Read the [privacy model](docs/privacy.md) and [security policy](SECURITY.md).

## Development

```bash
npm ci
npm run check
```

`npm run check` runs type checking, ESLint, tests with 80% global coverage thresholds, and a production build. CI validates Node 22 and 24 on Ubuntu, Windows, and macOS.

## Deliberate v0.1 exclusions

- No adaptive `auto` preset.
- No embeddings, vector database, or semantic model.
- No remote telemetry or dashboard.
- No automatic transcript/session interception.
- No custom diff engine.
- No claim of complete support for every coding agent.
- No npm publication in this release task.

See [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [MIT license](LICENSE).
