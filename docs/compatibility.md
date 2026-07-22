# Compatibility

TerseForge describes compatibility by mechanism, not by logo count.

## Levels

- **Native-limited:** the agent natively loads an included instruction or skill format and can call the local CLI, but TerseForge does not transparently intercept all tools.
- **Instructions-only:** a persistent rule file tells the agent how to use the CLI; runtime enforcement is not available.
- **Experimental:** the format is supplied, but discovery or version compatibility is not yet release-tested.

## Matrix

| Agent | Level | Project asset | Runtime behavior |
| --- | --- | --- | --- |
| Claude Code | Native-limited | `.claude/skills/terseforge`; optional `CLAUDE.md` | Native skill discovery and explicit CLI usage. No automatic interception. |
| Codex | Native-limited | `.agents/skills/terseforge`; optional `AGENTS.md` | Native skill discovery and explicit CLI usage. No automatic result replacement. |
| Gemini CLI | Native-limited | `.gemini/skills/terseforge`; optional `GEMINI.md` | Native Agent Skill discovery and explicit CLI usage. Hook interception is not claimed. |
| Generic AGENTS.md agent | Instructions-only | `AGENTS.md` | Policy and commands only. |
| Cursor | Instructions-only | `.cursor/rules/terseforge.mdc` | Persistent rule file only. |
| Windsurf | Instructions-only | `.windsurf/rules/terseforge.md` | Persistent rule file only. |
| Cline | Instructions-only | `.clinerules/terseforge.md` | Persistent rule file only. |

## Installation behavior

Install the natural-language skill once at user scope:

```bash
terseforge skill install --agent codex
terseforge skill install --agent claude
terseforge skill install --agent gemini
```

Or install only in the current repository:

```bash
terseforge skill install --agent codex --scope project
```

The exact discovery paths and activation phrases are documented in [natural-language activation](skills.md). Installation is idempotent and preserves foreign or partially occupied destinations.

The earlier instruction-file workflow remains available:

```bash
terseforge init --install codex claude gemini cursor windsurf cline
```

Existing target files are preserved and reported as skipped. All reference assets are also copied to `.terseforge/integrations/` for manual review.

## Verification status

v0.1 validates the skill package, tests installation paths and collision behavior, and tests the CLI end to end. It does not run full UI sessions inside every third-party agent. The `doctor` command reports installed assets separately from the integration level so "file exists" is not presented as "agent traffic is intercepted."
