# Compatibility

TerseForge describes compatibility by mechanism, not by logo count.

## Levels

- **Native-limited:** the agent natively loads an included instruction or skill format and can call the local CLI, but TerseForge does not transparently intercept all tools.
- **Instructions-only:** a persistent rule file tells the agent how to use the CLI; runtime enforcement is not available.
- **Experimental:** the format is supplied, but hook behavior and version compatibility are not yet release-tested.

## Matrix

| Agent | Level | Asset installed by `init` | Runtime behavior |
| --- | --- | --- | --- |
| Claude Code | Native-limited | `CLAUDE.md`; reusable `SKILL.md` reference | Agent may invoke explicit `terseforge` commands. No automatic interception. |
| Codex | Native-limited | `AGENTS.md`; reusable `SKILL.md` reference | Agent may invoke explicit `terseforge` commands. No automatic result replacement. |
| Gemini CLI | Experimental | `GEMINI.md` | Explicit CLI usage only; hook interception is not claimed. |
| Generic AGENTS.md agent | Instructions-only | `AGENTS.md` | Policy and commands only. |
| Cursor | Instructions-only | `.cursor/rules/terseforge.mdc` | Persistent rule file only. |
| Windsurf | Instructions-only | `.windsurf/rules/terseforge.md` | Persistent rule file only. |
| Cline | Instructions-only | `.clinerules/terseforge.md` | Persistent rule file only. |

## Installation behavior

```bash
terseforge init --install codex claude gemini cursor windsurf cline
```

Existing target files are preserved and reported as skipped. All reference assets are also copied to `.terseforge/integrations/` for manual review.

## Verification status

v0.1 tests the assets as files and tests the CLI end to end. It does not run full UI sessions inside every third-party agent. The `doctor` command reports installed assets separately from the integration level so “file exists” is not presented as “agent traffic is intercepted.”
